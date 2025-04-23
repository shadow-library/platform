/**
 * Importing npm packages
 */
import { describe, expect, it, jest } from 'bun:test';

/**
 * Importing user defined packages
 */
import { InternalError, Task } from '@shadow-library/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('Task', () => {
  it('executes successfully without retry', async () => {
    const fn = jest.fn().mockResolvedValue('done');
    const result = await Task.create(fn).name('Mock').delay(10).execute();
    expect(result).toBe('done');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries once then succeeds', async () => {
    const error = new Error('fail');
    const onRetry = jest.fn();
    const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('success');
    const result = await Task.create(fn).delay(10).backoff(2).retry(2).onRetry(onRetry).execute();
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(error, 1);
  });

  it('fails after all retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    await expect(Task.create(fn).delay(10).retry(2).execute()).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('executes rollback after success', async () => {
    const fn = jest.fn().mockResolvedValue('data');
    const rollback = jest.fn();
    const task = Task.create(fn).rollback(rollback);
    await task.execute();
    await task.executeRollback();
    expect(rollback).toHaveBeenCalledWith('data');
  });

  it('throws error if rollback is called with no result', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const rollback = jest.fn();
    const task = Task.create(fn).delay(10).rollback(rollback);
    await expect(task.execute()).rejects.toThrow('fail');
    await expect(task.executeRollback()).rejects.toThrow(InternalError);
  });

  it('throws error if rollback is missing and rollback is called', async () => {
    const fn = jest.fn().mockResolvedValue('data');
    const task = Task.create(fn);
    await task.execute();
    await expect(task.executeRollback()).rejects.toThrow('No rollback function provided');
  });
});
