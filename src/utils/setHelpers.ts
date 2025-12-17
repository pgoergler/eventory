import type { Dispatch, SetStateAction } from 'react';

type SetStateFn<T> = Dispatch<SetStateAction<Set<T>>>;

/**
 * Add items to a Set state
 */
export function addToSet<T>(setter: SetStateFn<T>, items: T | T[]): void {
  const itemsArray = Array.isArray(items) ? items : [items];
  setter((prev) => new Set([...prev, ...itemsArray]));
}

/**
 * Remove items from a Set state
 */
export function removeFromSet<T>(setter: SetStateFn<T>, items: T | T[]): void {
  const itemsArray = Array.isArray(items) ? items : [items];
  setter((prev) => {
    const next = new Set(prev);
    itemsArray.forEach((item) => next.delete(item));
    return next;
  });
}

/**
 * Remove items from multiple Set states at once
 */
export function removeFromSets<T>(
  setters: SetStateFn<T>[],
  items: T | T[]
): void {
  const itemsArray = Array.isArray(items) ? items : [items];
  for (const setter of setters) {
    setter((prev) => {
      const next = new Set(prev);
      itemsArray.forEach((item) => next.delete(item));
      return next;
    });
  }
}

/**
 * Toggle an item in a Set state
 */
export function toggleInSet<T>(setter: SetStateFn<T>, item: T): void {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(item)) {
      next.delete(item);
    } else {
      next.add(item);
    }
    return next;
  });
}

/**
 * Clear multiple Set states at once
 */
export function clearSets<T>(...setters: SetStateFn<T>[]): void {
  for (const setter of setters) {
    setter(new Set());
  }
}
