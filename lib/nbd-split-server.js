const fs = require('fs');
const net = require('net');

const NBD_MAGIC = 0x4e42444d41474943n;
const NBD_IHAVEOPT = 0x49484156454f5054n;
const NBD_REP_MAGIC = 0x0003e889045565a9n;
const NBD_REQUEST_MAGIC = 0x25609513;
const NBD_REPLY_MAGIC = 0x67446698;
const NBD_FLAG_FIXED_NEWSTYLE = 1;
const NBD_FLAG_NO_ZEROES = 2;
const NBD_FLAG_C_NO_ZEROES = 2;
const NBD_OPT_EXPORT_NAME = 1;
const NBD_OPT_ABORT = 2;
const NBD_OPT_LIST = 3;
const NBD_REP_ACK = 1;
const NBD_REP_ERR_UNSUP = 0x80000001;
const NBD_CMD_READ = 0;
const NBD_CMD_DISC = 2;
const NBD_CMD_FLUSH = 3;
const NBD_FLAG_HAS_FLAGS = 1;
const NBD_FLAG_READ_ONLY = 2;
const EIO = 5;
const EROFS = 30;

class NbdSplitServer {
  constructor(parts, port = 60464) {
    if (!Array.isArray(parts) || parts.length === 0) {
      throw new Error('At least one NBD split part is required.');
    }
    this.parts = parts.map((filePath) => fs.openSync(filePath, 'r'));
    this.partSizes = this.parts.map((fd) => fs.fstatSync(fd).size);
    this.size = this.partSizes.reduce((sum, value) => sum + value, 0);
    this.partStarts = [];
    let offset = 0;
    for (const size of this.partSizes) {
      this.partStarts.push(offset);
      offset += size;
    }
    this.port = port;
    this.server = null;
    this.sockets = new Set();
  }

  async start() {
    if (this.server) return this.port;
    this.server = net.createServer((socket) => this.handleSocket(socket));
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        this.server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off('error', onError);
        resolve();
      };
      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen(this.port, '127.0.0.1');
    });
    this.port = this.server.address().port;
    return this.port;
  }

  async stop() {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    if (this.server) {
      await new Promise((resolve) => this.server.close(resolve));
      this.server = null;
    }
    for (const fd of this.parts) {
      try {
        fs.closeSync(fd);
      } catch {
        // The descriptor may already be closed during shutdown.
      }
    }
    this.parts = [];
  }

  handleSocket(socket) {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => {});

    const handshake = Buffer.alloc(18);
    handshake.writeBigUInt64BE(NBD_MAGIC, 0);
    handshake.writeBigUInt64BE(NBD_IHAVEOPT, 8);
    handshake.writeUInt16BE(NBD_FLAG_FIXED_NEWSTYLE | NBD_FLAG_NO_ZEROES, 16);
    socket.write(handshake);

    let state = 'client-flags';
    let clientFlags = 0;
    let buffered = Buffer.alloc(0);
    socket.on('data', async (chunk) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (state === 'client-flags') {
        if (buffered.length < 4) return;
        clientFlags = buffered.readUInt32BE(0);
        buffered = buffered.subarray(4);
        state = 'options';
      }
      while (state === 'options' && buffered.length >= 16) {
        const magic = buffered.readBigUInt64BE(0);
        const option = buffered.readUInt32BE(8);
        const length = buffered.readUInt32BE(12);
        if (magic !== NBD_IHAVEOPT || buffered.length < 16 + length) return;
        buffered = buffered.subarray(16 + length);
        if (option === NBD_OPT_EXPORT_NAME) {
          const exportInfo = Buffer.alloc(
            10 + ((clientFlags & NBD_FLAG_C_NO_ZEROES) ? 0 : 124)
          );
          exportInfo.writeBigUInt64BE(BigInt(this.size), 0);
          exportInfo.writeUInt16BE(NBD_FLAG_HAS_FLAGS | NBD_FLAG_READ_ONLY, 8);
          socket.write(exportInfo);
          state = 'transmission';
        } else if (option === NBD_OPT_ABORT) {
          socket.end();
          return;
        } else {
          this.writeOptionReply(
            socket,
            option,
            option === NBD_OPT_LIST ? NBD_REP_ACK : NBD_REP_ERR_UNSUP
          );
        }
      }
      if (state !== 'transmission') return;
      while (buffered.length >= 28) {
        const request = buffered.subarray(0, 28);
        buffered = buffered.subarray(28);
        await this.handleRequest(socket, request);
      }
    });
  }

  writeOptionReply(socket, option, replyType) {
    const reply = Buffer.alloc(20);
    reply.writeBigUInt64BE(NBD_REP_MAGIC, 0);
    reply.writeUInt32BE(option, 8);
    reply.writeUInt32BE(replyType, 12);
    reply.writeUInt32BE(0, 16);
    socket.write(reply);
  }

  async handleRequest(socket, request) {
    if (request.readUInt32BE(0) !== NBD_REQUEST_MAGIC) {
      socket.destroy();
      return;
    }
    const type = request.readUInt16BE(6);
    const handle = request.subarray(8, 16);
    const offset = Number(request.readBigUInt64BE(16));
    const length = request.readUInt32BE(24);

    if (type === NBD_CMD_DISC) {
      socket.end();
      return;
    }
    if (type === NBD_CMD_FLUSH) {
      this.writeReply(socket, 0, handle);
      return;
    }
    if (type !== NBD_CMD_READ) {
      this.writeReply(socket, EROFS, handle);
      return;
    }
    if (length === 0 || offset + length > this.size) {
      this.writeReply(socket, EIO, handle);
      return;
    }

    try {
      const data = await this.readRange(offset, length);
      const reply = Buffer.alloc(16);
      reply.writeUInt32BE(NBD_REPLY_MAGIC, 0);
      reply.writeUInt16BE(0, 4);
      handle.copy(reply, 8);
      socket.write(reply);
      socket.write(data);
    } catch {
      this.writeReply(socket, EIO, handle);
    }
  }

  writeReply(socket, error, handle) {
    const reply = Buffer.alloc(16);
    reply.writeUInt32BE(NBD_REPLY_MAGIC, 0);
    reply.writeUInt16BE(error, 4);
    handle.copy(reply, 8);
    socket.write(reply);
  }

  async readRange(offset, length) {
    const result = Buffer.allocUnsafe(length);
    let written = 0;
    let absolute = offset;
    while (written < length) {
      const partIndex = this.findPart(absolute);
      if (partIndex < 0) throw new Error('NBD read offset is outside the image.');
      const localOffset = absolute - this.partStarts[partIndex];
      const available = this.partSizes[partIndex] - localOffset;
      const toRead = Math.min(length - written, available);
      const bytesRead = await new Promise((resolve, reject) => {
        fs.read(
          this.parts[partIndex],
          result,
          written,
          toRead,
          localOffset,
          (error, count) => (error ? reject(error) : resolve(count))
        );
      });
      if (bytesRead !== toRead) throw new Error('Unexpected end of NBD split part.');
      written += toRead;
      absolute += toRead;
    }
    return result;
  }

  findPart(offset) {
    let low = 0;
    let high = this.partStarts.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const start = this.partStarts[middle];
      const end = start + this.partSizes[middle];
      if (offset < start) high = middle - 1;
      else if (offset >= end) low = middle + 1;
      else return middle;
    }
    return -1;
  }
}

module.exports = { NbdSplitServer };
