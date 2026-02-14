import { NextApiRequest, NextApiResponse } from 'next';
import { WebSocketService } from '@/services/websocketService';
import { Server as HTTPServer } from 'http';

// Initialize Socket.IO server once per process
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // `res.socket.server` is the native Node.js HTTP server instance
  const server: any = res.socket.server as unknown as HTTPServer & { io?: boolean };

  if (!server.io) {
    // Initialize our WebSocketService which will attach Socket.IO to the server
    WebSocketService.initialize(res.socket.server as unknown as HTTPServer);
    server.io = true;
    console.log('Socket.IO initialized on server');
  }

  res.status(200).end();
}
