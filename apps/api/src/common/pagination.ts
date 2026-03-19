import { BadRequestException } from '@nestjs/common';
import type { ApiResponseMeta, ApiSuccessResponse } from '@urban/shared-types';

interface SortCursorPayload {
  id: string;
  sortValue: string;
}

function parseCursorString(
  value: unknown,
  field = 'cursor',
): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    throw new BadRequestException(`${field} must be a string.`);
  }

  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${field} must be a string.`);
  }

  return value.trim();
}

function encodeCursorPayload(payload: SortCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursorPayload(
  value: unknown,
  field = 'cursor',
): SortCursorPayload | undefined {
  const raw = parseCursorString(value, field);

  if (!raw) {
    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException(`${field} is invalid.`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new BadRequestException(`${field} is invalid.`);
  }

  const payload = parsed as Partial<SortCursorPayload>;

  if (
    typeof payload.id !== 'string' ||
    !payload.id.trim() ||
    typeof payload.sortValue !== 'string' ||
    !payload.sortValue.trim()
  ) {
    throw new BadRequestException(`${field} is invalid.`);
  }

  return {
    id: payload.id.trim(),
    sortValue: payload.sortValue.trim(),
  };
}

function compareDescending(
  leftSortValue: string,
  leftId: string,
  rightSortValue: string,
  rightId: string,
): number {
  const sortComparison = rightSortValue.localeCompare(leftSortValue);

  if (sortComparison !== 0) {
    return sortComparison;
  }

  return rightId.localeCompare(leftId);
}

export function paginateSortedItems<T>(
  items: T[],
  limit: number,
  cursorValue: unknown,
  getSortValue: (item: T) => string,
  getId: (item: T) => string,
): {
  items: T[];
  nextCursor?: string;
} {
  const cursor = decodeCursorPayload(cursorValue);
  const sorted = [...items].sort((left, right) =>
    compareDescending(
      getSortValue(left),
      getId(left),
      getSortValue(right),
      getId(right),
    ),
  );
  const filtered = cursor
    ? sorted.filter(
        (item) =>
          compareDescending(
            getSortValue(item),
            getId(item),
            cursor.sortValue,
            cursor.id,
          ) > 0,
      )
    : sorted;
  const pageItems = filtered.slice(0, limit);
  const hasMore = filtered.length > pageItems.length;
  const lastItem = pageItems.at(-1);

  return {
    items: pageItems,
    nextCursor:
      hasMore && lastItem
        ? encodeCursorPayload({
            id: getId(lastItem),
            sortValue: getSortValue(lastItem),
          })
        : undefined,
  };
}

export function buildPaginatedResponse<T>(
  data: T[],
  nextCursor?: string,
): ApiSuccessResponse<T[], ApiResponseMeta> {
  return {
    success: true,
    data,
    meta: {
      count: data.length,
      nextCursor,
    },
  };
}
