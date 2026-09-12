import mongoose from 'mongoose';

const citationSchema = new mongoose.Schema(
  {
    filePath: { type: String, required: true },
    startLine: { type: Number },
    endLine: { type: Number },
  },
  { _id: false }
);

const qaHistorySchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  repo: { type: mongoose.Schema.Types.ObjectId, ref: 'Repo', required: true, index: true },

  question: { type: String, required: true },
  answer: { type: String, required: true },
  citations: [citationSchema],

  llmProvider: { type: String, enum: ['groq', 'gemini', 'openrouter'], default: 'groq' },

  createdAt: { type: Date, default: Date.now, expires: '30d' }, // TTL index — auto-delete after 30 days to respect MongoDB 512MB cap
});

export const QAHistory = mongoose.model('QAHistory', qaHistorySchema);
