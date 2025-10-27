import io from 'socket.io-client';

const socket = io(process.env.REACT_APP_SERVER_URL || 'http://localhost:5000');

export const socketService = {
  // Queue events
  onQueueUpdated: (callback) => {
    socket.on('queueUpdated', callback);
  },
  
  offQueueUpdated: (callback) => {
    socket.off('queueUpdated', callback);
  },
  
  // Table events
  onTablesUpdated: (callback) => {
    socket.on('tablesUpdated', callback);
  },
  
  offTablesUpdated: (callback) => {
    socket.off('tablesUpdated', callback);
  },
  
  // Menu events
  onMenuUpdated: (callback) => {
    socket.on('menuUpdated', callback);
  },
  
  offMenuUpdated: (callback) => {
    socket.off('menuUpdated', callback);
  },
  
  // Connection management
  connect: () => {
    socket.connect();
  },
  
  disconnect: () => {
    socket.disconnect();
  }
};

export default socket;