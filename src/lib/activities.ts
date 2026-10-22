import { z } from 'zod';

const freeText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value));

export const activityId = z.string().regex(/^[a-zA-Z0-9]{20}$/);
export const activityFields = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(70)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
  description: freeText(2000),
  durationMinutes: z.number().int().min(1).max(240),
  prompts: z.array(freeText(2000)).min(1).max(5),
});
export type ActivityFields = z.infer<typeof activityFields>;
export type ActivityTemplate = ActivityFields & {
  id: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
};
export const activityRequest = z.discriminatedUnion('action', [
  activityFields.extend({ action: z.literal('save'), id: activityId.optional() }).strict(),
  z.object({ action: z.literal('delete'), id: activityId, confirmed: z.literal(true) }).strict(),
]);
