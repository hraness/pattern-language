import { planBatch as reference } from '../reference.mjs';

export function planBatch(input, capabilities) {
  try {
    return reference(input, capabilities);
  } catch (error) {
    if (input && typeof input === 'object') input.errorFlag = true;
    throw error;
  }
}
