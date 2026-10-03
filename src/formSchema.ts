import { z } from 'zod';
import type { CalculatorMode } from './types';

const sizeSchema = z.object({
  sheets: z.number().int('integer').positive('positive').optional(),
  length: z.number().positive('positive').optional(),
  profilesPerPackage: z
    .number()
    .int('integer')
    .positive('positive')
    .optional(),
});

const producedEntrySchema = z.object({
  value: z.number().min(0, 'nonNegative').optional(),
  // Optional tag that pins an entry to a specific size in sizes-mode (lets
  // a single size accumulate multiple partial-production entries). Must be
  // declared here — otherwise zod strips it when parsing through the
  // resolver and useFieldArray state loses the tag right after append().
  sizeIndex: z.number().int().min(0).optional(),
});

// The produced/rate arrays are PARALLEL (indexed by position). Rendering only
// the visible sizes' advanced blocks can leave undefined holes in the shorter
// arrays (e.g. producedSheets filled by an advance, sheetsPerPallet not), which
// would fail validation ("expected object, received undefined") and block a
// recompute until every size is expanded. The calculator already treats a
// missing entry as empty (`e?.value ?? 0`), so normalise holes to empty entries
// before validating instead of rejecting them. `Array.from` also materialises
// sparse holes (not just explicit undefined).
// Typed as the plain optional array: `z.preprocess` widens the *input* type to
// `unknown`, which breaks the RHF resolver ↔ FormValues match under `tsc -b`.
// The runtime still preprocesses; the declared types are unchanged.
const producedArray = z
  .preprocess(
    (v) =>
      Array.isArray(v)
        ? Array.from(v, (e) => (e == null ? { value: undefined } : e))
        : v,
    z.array(producedEntrySchema),
  )
  .optional() as unknown as z.ZodOptional<
  z.ZodArray<typeof producedEntrySchema>
>;

const orderSchema = z.object({
  id: z.string(),
  productName: z.string().optional(),
  useTotalLength: z.boolean().optional(),
  totalLengthM: z.number().positive('positive').optional(),
  sizes: z.array(sizeSchema).optional(),
  sheets: z.number().int('integer').positive('positive').optional(),
  sheetLengthMm: z.number().positive('positive').optional(),
  speedMPerMin: z.number().positive('positive').optional(),
  cavity: z.number().int('integer').positive('positive').optional(),
  gapEnabled: z.boolean().optional(),
  gapAfterMin: z.number().min(0, 'nonNegative').optional(),
  producedProfiles: producedArray,
  producedPackages: producedArray,
  producedSheets: producedArray,
  sheetsPerPallet: producedArray,
  producedPallets: producedArray,
  producedItemLength: producedArray,
  profilesPerPackage: producedArray,
  // Opaque Piramide layout (NestingResult) carried with the order so it can show
  // its pallet-arrangement schema. Not validated — passed through as-is.
  piramideSchema: z.any().optional(),
});

const weekendDaySchema = z.object({
  enabled: z.boolean(),
  full24: z.boolean(),
  start: z.number().min(0).max(23.5),
  end: z.number().min(0.5).max(24),
});

const settingsSchema = z.object({
  startMode: z.enum(['now', 'manual']),
  startAt: z.string().optional(),
  gapMode: z.enum(['continuous', 'withGaps']),
  productName: z.string().optional(),
  weekend: z
    .object({
      enabled: z.boolean(),
      sat: weekendDaySchema,
      sun: weekendDaySchema,
    })
    .optional(),
  warmupMinutes: z.number().min(0).max(1440).optional(),
  shutdownMinutes: z.number().min(0).max(1440).optional(),
  noLimits: z.boolean().optional(),
  frozen: z.boolean().optional(),
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

      if (orders.length > 0) {
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
