import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store';
import toast from 'react-hot-toast';

export const useSocket = () => {
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socket = io('/', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      // Connected to real-time channel
    });

    socket.on('task:created', () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dag'] });
    });

    socket.on('task:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dag'] });
    });

    socket.on('task:deleted', () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dag'] });
      toast.success('Task removed');
    });

    socket.on('task:moved', (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dag'] });
      if (data?.regression) {
        toast.error('Task regression detected — downstream dependencies re-evaluated and blocked', { duration: 4000 });
      }
    });

    socket.on('task:reordered', () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });

    socket.on('dependency:added', () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dag'] });
      toast.success('Dependency linked');
    });

    socket.on('dependency:removed', () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dag'] });
    });

    socket.on('schedule:propagated', (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dag'] });
      const count = data?.changes?.length || 0;
      if (count > 0) {
        toast('Propagated schedule to ' + count + ' downstream task(s) without compounding', {
          duration: 4000,
        });
      }
    });

    socket.on('ai:suggestion-ready', (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-suggestions'] });
      toast('New AI suggestion ready (' + (data?.count || 1) + ')');
    });

    return () => {
      socket.disconnect();
    };
  }, [token, queryClient]);

  return socketRef.current;
};
