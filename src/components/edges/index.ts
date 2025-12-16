import type { EdgeTypes } from 'reactflow';
import { FloatingEdge } from './FloatingEdge';
import { FloatingConnectionLine } from './FloatingConnectionLine';

export const edgeTypes: EdgeTypes = {
  floating: FloatingEdge,
};

export { FloatingConnectionLine };
