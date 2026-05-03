import { z } from 'zod';
import type { CalculatorMode } from './types';

const sizeSchema = z.object({
  sheets: z.number().int('integer').positive('positive').optional(),
  length: z.number().positive('positive').optional(),
});

const producedEntrySchema = z.object({
  value: z.number().min(0, 'nonNegative').optional(),
});

const orderSchema = z.object({
  id: z.string(),
  productName: z.string().optional(),
  useTotalLength: z.boolean().optional(),
  totalLengthM: z.number().positive('positive').optional(),
  sizes: z.array(sizeSchema).optional(),
  sheets: z.number().int('integer').positive('positive').optional(),
  sheetLengthMm: z.number().positive('positive').optional(),
  speedMPerMin: z.number().positive('positive').optional(),
  gapAfterMin: z.number().min(0, 'nonNegative').optional(),
  profilesPerPackage: z
    .number()
    .int('integer')
    .positive('positive')
    .optional(),
  producedProfiles: z.array(producedEntrySchema).optional(),
  producedPackages: z.array(producedEntrySchema).optional(),
  producedSheets: z.array(producedEntrySchema).optional(),
  sheetsPerPallet: z.array(producedEntrySchema).optional(),
  producedPallets: z.array(producedEntrySchema).optional(),
  producedItemLength: z.number().positive('positive').optional(),
});

const settingsSchema = z.object({
  startMode: z.enum(['now', 'manual']),
  startAt: z.string().optional(),
  speedMode: z.enum(['global', 'perOrder']),
  globalSpeed: z.number().positive('positive').optional(),
  gapMode: z.enum(['continuous', 'withGaps']),
  productName: z.string().optional(),
});

export const buildFormSchema = (mode: CalculatorMode = 'sheets') => {
  const enterPiecesCode =
    mode === 'profiles' ? 'enterProfiles' : 'enterSheets';

  return z
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
          message: 'enterStartTime',
        });
      }

      if (settings.speedMode === 'global') {
        if (settings.globalSpeed === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['settings', 'globalSpeed'],
            message: 'enterSpeed',
          });
        } else if (settings.globalSpeed <= 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['settings', 'globalSpeed'],
            message: 'positive',
          });
        }
      }

      if (settings.speedMode === 'perOrder' && orders.length > 0) {
        const first = orders[0];
        if (first.speedMPerMin === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['orders', 0, 'speedMPerMin'],
            message: 'enterOrderSpeed',
          });
        } else if (first.speedMPerMin <= 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['orders', 0, 'speedMPerMin'],
            message: 'positive',
          });
        }
      }

      orders.forEach((order, idx) => {
        if (order.useTotalLength) {
          if (order.totalLengthM === undefined) {
            ctx.addIssue({
              code: 'custom',
              path: ['orders', idx, 'totalLengthM'],
              message: 'enterTotalLength',
            });
          } else if (order.totalLengthM <= 0) {
            ctx.addIssue({
              code: 'custom',
              path: ['orders', idx, 'totalLengthM'],
              message: 'positive',
            });
          }
          return;
        }

        if (!order.sizes || order.sizes.length === 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['orders', idx, 'sizes'],
            message: 'minRequired',
          });
          return;
        }

        order.sizes.forEach((size, sIdx) => {
          if (size.sheets === undefined) {
            ctx.addIssue({
              code: 'custom',
              path: ['orders', idx, 'sizes', sIdx, 'sheets'],
              message: enterPiecesCode,
            });
          } else if (size.sheets <= 0) {
            ctx.addIssue({
              code: 'custom',
              path: ['orders', idx, 'sizes', sIdx, 'sheets'],
              message: 'positive',
            });
          }
          if (size.length === undefined) {
            ctx.addIssue({
              code: 'custom',
              path: ['orders', idx, 'sizes', sIdx, 'length'],
              message: 'enterLength',
            });
          } else if (size.length <= 0) {
            ctx.addIssue({
              code: 'custom',
              path: ['orders', idx, 'sizes', sIdx, 'length'],
              message: 'positive',
            });
          }
        });
      });
    });
};

export type FormValues = z.infer<ReturnType<typeof buildFormSchema>>;
