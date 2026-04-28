import { z } from 'zod';
import type { CalculatorMode } from './types';

const orderSchema = z.object({
  id: z.string(),
  sheets: z
    .number({ error: 'required' })
    .int('integer')
    .positive('positive'),
  sheetLengthMm: z.number({ error: 'required' }).positive('positive'),
  speedMPerMin: z.number().positive('positive').optional(),
  gapAfterMin: z.number().min(0, 'nonNegative').optional(),
  profilesPerPackage: z
    .number()
    .int('integer')
    .positive('positive')
    .optional(),
});

const settingsSchema = z.object({
  startMode: z.enum(['now', 'manual']),
  startAt: z.string().optional(),
  speedMode: z.enum(['global', 'perOrder']),
  globalSpeed: z.number().positive('positive').optional(),
  gapMode: z.enum(['continuous', 'withGaps']),
});

export const buildFormSchema = (mode: CalculatorMode) =>
  z
    .object({
      settings: settingsSchema,
      orders: z.array(orderSchema).min(1, 'minRequired'),
    })
    .superRefine((data, ctx) => {
      const { settings, orders } = data;

      if (settings.startMode === 'manual' && !settings.startAt) {
        ctx.addIssue({
          code: 'custom',
          path: ['settings', 'startAt'],
          message: 'required',
        });
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

      if (settings.speedMode === 'perOrder' && orders.length > 0) {
        const first = orders[0];
        if (!first.speedMPerMin || first.speedMPerMin <= 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['orders', 0, 'speedMPerMin'],
            message: 'positive',
          });
        }
      }

      if (mode === 'profiles') {
        orders.forEach((order, idx) => {
          if (!order.profilesPerPackage || order.profilesPerPackage <= 0) {
            ctx.addIssue({
              code: 'custom',
              path: ['orders', idx, 'profilesPerPackage'],
              message: 'positive',
            });
          }
        });
      }
    });

export type FormValues = z.infer<ReturnType<typeof buildFormSchema>>;
