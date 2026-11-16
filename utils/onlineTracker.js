// In-memory online user tracking using Socket.IO connections
const userSockets = new Map(); // userId (string) -> Set of socketIds
let ioInstance = null;

const onlineTracker = {
  setIo: (io) => {
    ioInstance = io;
  },

  addUserSocket: (userId, socketId) => {
    if (!userId) return;
    const uid = String(userId);
    const existing = userSockets.get(uid) || new Set();
    const wasOffline = existing.size === 0;
    existing.add(socketId);
    userSockets.set(uid, existing);

    if (wasOffline && ioInstance) {
      ioInstance.emit('user:status_change', { userId: uid, isOnline: true });
    }
  },

  removeSocket: (socketId) => {
    for (const [userId, sockets] of userSockets.entries()) {
      if (sockets.has(socketId)) {
        sockets.delete(socketId);
        if (sockets.size === 0) {
          userSockets.delete(userId);
          if (ioInstance) {
            ioInstance.emit('user:status_change', { userId, isOnline: false });
          }
        }
        break;
      }
    }
  },

  isUserOnline: (userId) => {
    if (!userId) return false;
    const sockets = userSockets.get(String(userId));
    return Boolean(sockets && sockets.size > 0);
  },

  getOnlineUserIds: () => {
    return Array.from(userSockets.keys());
  }
};

module.exports = onlineTracker;
