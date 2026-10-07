import {z} from 'zod';
export const SpanSchema=z.object({chapterId:z.string(),rev:z.number().int().positive(),start:z.number().int().nonnegative(),end:z.number().int().nonnegative(),quote:z.string().max(12000)});
export const ReplySchema=z.object({
  kind:z.enum(['answer','candidate','ask','analysis']),message:z.string().min(1).max(16000),
  replacement:z.string().max(16000).optional(),reasons:z.array(z.string().max(1500)).max(12),
  questions:z.array(z.string().max(1000)).max(5),evidenceIds:z.array(z.string()).max(80),
  memories:z.array(z.object({key:z.string().min(1).max(180),type:z.enum(['plot','world','social','character','item','style','knowledge']),value:z.string().min(1).max(4000),certainty:z.enum(['explicit','inference']),evidence:z.array(SpanSchema).min(1).max(6)})).max(80),
}).strict();

