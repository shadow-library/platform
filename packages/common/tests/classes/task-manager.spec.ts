/**
 * Importing npm packages
 */
import { describe, expect, it, jest } from 'bun:test';

/**
 * Importing user defined packages
 */
import { Task, TaskManager } from '@shadow-library/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('TaskManager', () => {
  it('should execute tasks in order', async () => {
    const manager = TaskManager.create();
    const task1 = jest.fn().mockResolvedValue('task1');
    const task2 = jest.fn().mockResolvedValue('task2');
    manager.addTask(task1);
    manager.addTask(task2);

    await manager.execute();

    expect(task1).toHaveBeenCalled();
    expect(task2).toHaveBeenCalled();
    expect(task1.mock.invocationCallOrder[0]).toBeLessThan(task2.mock.invocationCallOrder[0] as number);
  });

  it('should return results of tasks', async () => {
    const manager = TaskManager.create();
    const task1 = Task.create(jest.fn().mockResolvedValue('task1'));
    const task2 = jest.fn().mockResolvedValue('task2');

    manager.addTask(task1);
    manager.addTask(task2);
    const results = await manager.execute();

    expect(results.size).toBe(2);
    expect(results.get(task1)).toBe('task1');
    expect(results.get(task2)).toBe('task2');
    expect(manager.getResult(task1)).toBe('task1');
    expect(manager.getResult(task2)).toBe('task2');
    expect(manager.getResult(jest.fn())).toBeUndefined();
  });

  it('should rollback tasks on error', async () => {
    const manager = TaskManager.create({ rollbackOnError: true });
    const rollback = jest.fn();
    const task1 = Task.create(jest.fn().mockResolvedValue('task1')).rollback(rollback);
    const task2 = jest.fn().mockRejectedValue(new Error('task2 error'));

    manager.addTask(task1);
    manager.addTask(task2);
    await expect(manager.execute()).rejects.toThrow('task2 error');

    expect(rollback).toHaveBeenCalled();
  });
});
