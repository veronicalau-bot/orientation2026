export interface Quest {
  id: string;
  title: string;
  description: string;
  location: string;
}

export interface Session {
  sessionId: string;
  name: string;
  status: 'active' | 'inactive';
  createdAt: number;
  questions: Quest[];
}

export interface Submission {
  submissionId: string;
  sessionId: string;
  playerName: string;
  groupName: string; // Split routing flow e.g., "Alpha", "Beta", "Gamma"
  questionId: string;
  questionTitle: string;
  imageUrl: string; // Compressed base64 representation or storage URL
  aiComment: string;
  isApproved: boolean; // For real-time review panel filtering
  createdAt: number;
}
