/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { InjectionToken } from '../../interfaces';

/**
 * Defining types
 */

interface NodeMetadata<T = unknown> {
  node: T;
  distance: number;
  dependsOn: number;
  requiredBy: number;
}

/**
 * Declaring the constants
 */

function tieBreakerSort(a: NodeMetadata, b: NodeMetadata): number {
  if (a.dependsOn !== b.dependsOn) return a.dependsOn - b.dependsOn;
  if (a.requiredBy !== b.requiredBy) return b.requiredBy - a.requiredBy;
  return 0;
}

export class DependencyGraph<T extends InjectionToken> {
  private readonly nodeMap = new Map<T, Set<T>>();

  getNodes(): T[] {
    return Array.from(this.nodeMap.keys());
  }

  addNode(node: T): this {
    if (!this.nodeMap.has(node)) this.nodeMap.set(node, new Set());
    return this;
  }

  getDependencies(node: T): Set<T> {
    return this.nodeMap.get(node) ?? new Set();
  }

  addDependency(node: T, dependency: T): this {
    let nodeMap = this.nodeMap.get(node);
    if (typeof nodeMap === 'undefined') nodeMap = this.addNode(node).getDependencies(node);
    if (!this.nodeMap.has(dependency)) this.addNode(dependency);
    nodeMap.add(dependency);
    return this;
  }

  getInitOrder(): T[] {
    const metadata = new Map<T, NodeMetadata<T>>();
    const queue: T[] = [];

    /** add the node, dependsOn and requiredBy data */
    for (const [node, deps] of this.nodeMap.entries()) {
      if (deps.size == 0) queue.push(node);
      const nodeMetadata = metadata.get(node);
      if (nodeMetadata) nodeMetadata.dependsOn = deps.size;
      else metadata.set(node, { node, distance: 0, dependsOn: deps.size, requiredBy: 0 });
      for (const dep of deps) {
        const depMetadata = metadata.get(dep);
        if (depMetadata) depMetadata.requiredBy++;
        else metadata.set(dep, { node: dep, distance: 0, dependsOn: 0, requiredBy: 1 });
      }
    }

    let current: T | null = null;
    const orderedNodes = new Set<T>();
    while ((current = getNextNode()) !== null) {
      const currentMetadata = metadata.get(current) as NodeMetadata;
      orderedNodes.add(current);

      for (const [node, deps] of this.nodeMap.entries()) {
        if (!deps.has(current)) continue;
        const nodeMetadata = metadata.get(node) as NodeMetadata;
        const newDistance = currentMetadata.distance + 1;
        if (newDistance > nodeMetadata.distance) nodeMetadata.distance = newDistance;
        if (--nodeMetadata.dependsOn === 0 && !orderedNodes.has(node)) queue.push(node);
      }
    }

    return Array.from(orderedNodes);

    function getNextNode(): T | null {
      if (queue.length > 0) return queue.shift() as T;
      const remainingNodes = Array.from(metadata.values()).filter(m => m.dependsOn > 0);
      if (remainingNodes.length === 0) return null;
      const values = remainingNodes.sort(tieBreakerSort);
      return (values[0] as NodeMetadata<T>).node;
    }
  }
}
