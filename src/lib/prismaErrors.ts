import { Prisma } from '@/generated/prisma/client';

// P2002 = unique constraint violation. Used to detect a losing race on an
// atomic claim (two concurrent create() calls hitting the same unique key).
export function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
