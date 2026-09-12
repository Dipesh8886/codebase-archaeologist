import { z } from 'zod';

export const addRepoSchema = z.object({
  fullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'Expected "owner/repo" format'),
  scopedPath: z.string().max(255).optional().nullable(),
  excludePatterns: z.array(z.string().max(100)).max(50).optional(),
});

export const estimateRepoSchema = addRepoSchema;

export const askQuestionSchema = z.object({
  question: z.string().min(3).max(1000),
});

export const exportSchema = z.object({
  format: z.enum(['markdown', 'pdf']),
});
