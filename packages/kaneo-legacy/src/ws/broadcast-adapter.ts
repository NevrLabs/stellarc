export type BoardBroadcastMessage = {
  type: string;
  boardId: string;
  userId?: string;
  userIds?: string[];
  taskId?: string;
  sourceTaskId?: string;
  targetTaskId?: string;
};

export type BroadcastMessage = {
  boardId: string;
  message: BoardBroadcastMessage;
  excludeInitiatorId?: string;
};

export type BroadcastAdapter = {
  /** Publish a message to all instances watching this board */
  publish(msg: BroadcastMessage): Promise<void>;

  /** Subscribe to messages for delivery to local connections */
  subscribe(handler: (msg: BroadcastMessage) => void): Promise<void>;

  /** Cleanup on shutdown */
  shutdown(): Promise<void>;
};
