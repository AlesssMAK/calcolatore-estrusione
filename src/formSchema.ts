import { z } from 'zod';

export const orderSchema = z.object({
  id: z.string(),
  sheets: z
    .number({ error: 'required' })
    .int('integer')
    .positive('positive'),
  sheetLengthMm: z
    .number({ error: 'required' })
    .positive('positive'),
  speedMPerMin: z.number().positive('positive').optional(),
  gapAfterMin: z.number().min(0, 'nonNegative').optional(),
});

export const settingsSchema = z.object({
  startMode: z.enum(['now', 'manual']),
  startAt: z.string().optional(),
  speedMode: z.enum(['global', 'perOrder']),
  globalSpeed: z.number().positive('positive').optional(),
  gapMode: z.enum(['continuous', 'withGaps']),
});

export const formSchema = z
  .object({
    settings: settingsSchema,
    orders: z.array(orderSchema).min(1, 'minRequired'),
  })
  .superRefine((data, ctx) => {
    const { settings, orders } = data;

    if (settings.startMode === 'manual') {
      if (!settings.startAt) {
        ctx.addIssue({
          code: 'custom',
          path: ['settings', 'startAt'],
          message: 'required',
        });
      }
    }

    if (settings.speedMode === 'global') {
      if (!settings.globalSpeed || settings.globalSpeed <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['settings', 'globalSpeed'],
          message: 'positive',
        });
      }
    }

    if (settings.speedMode === 'perOrder') {
      orders.forEach((order, idx) => {
        if (!order.speedMPerMin || order.speedMPerMin <= 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['orders', idx, 'speedMPerMin'],
            message: 'positive',
          });
        }
      });
    }

    if (settings.gapMode === 'withGaps') {
      orders.forEach((order, idx) => {
        if (idx === orders.length - 1) return;
        if (order.gapAfterMin === undefined || order.gapAfterMin < 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['orders', idx, 'gapAfterMin'],
            message: 'nonNegative',
          });
        }
      });
    }
  });

export type FormValues = z.infer<typeof formSchema>;
