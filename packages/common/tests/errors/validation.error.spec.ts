/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { ValidationError } from '@shadow-library/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('ValidationError', () => {
  it('should create an instance of ValidationError', () => {
    const error = new ValidationError('fieldOne', 'value one');
    expect(error.message).toBe('Validation Error');
    expect(error).toBeInstanceOf(ValidationError);
  });

  it('should add a field error', () => {
    const error = new ValidationError('fieldOne', 'value one').addFieldError('fieldTwo', 'value two');
    expect(error.getErrorCount()).toBe(2);
  });

  it('should throw generic error for no error fields', () => {
    const error = new ValidationError();
    expect(error.getSummary()).toBe('Validation failed');
  });

  it('should return the error message for single field', () => {
    const msg = 'Validation failed for fieldOne';
    const error = new ValidationError('fieldOne', 'value one');

    expect(error.getSummary()).toBe(msg);
  });

  it('should return the error message for multiple fields', () => {
    const error = new ValidationError('fieldOne', 'value one').addFieldError('fieldTwo', 'value two');
    expect(error.getSummary()).toBe('Validation failed for fieldOne and fieldTwo');

    error.addFieldError('fieldThree', 'value three');
    expect(error.getSummary()).toBe('Validation failed for fieldOne, fieldTwo and fieldThree');
  });

  it('should return the errors', () => {
    const error = new ValidationError('fieldOne', 'value one').addFieldError('fieldTwo', 'value two');
    const errors = error.getErrors();
    expect(errors).toStrictEqual([
      { field: 'fieldOne', msg: 'value one' },
      { field: 'fieldTwo', msg: 'value two' },
    ]);
  });

  it('should return the error object', () => {
    const error = new ValidationError('fieldOne', 'value one').addFieldError('fieldTwo', 'value two');
    expect(error.toObject()).toStrictEqual({
      code: 'VALIDATION_ERROR',
      type: 'VALIDATION_ERROR',
      message: 'Validation Error',
      fields: [
        { field: 'fieldOne', msg: 'value one' },
        { field: 'fieldTwo', msg: 'value two' },
      ],
    });
  });

  it('should combine errors', () => {
    const errorOne = new ValidationError('fieldOne', 'value one');
    const errorTwo = new ValidationError('fieldTwo', 'value two');
    const combinedError = ValidationError.combineErrors(errorOne, errorTwo);

    expect(combinedError).toBeInstanceOf(ValidationError);
    expect(combinedError.getErrorCount()).toBe(2);
    expect(combinedError.getErrors()).toStrictEqual([
      { field: 'fieldOne', msg: 'value one' },
      { field: 'fieldTwo', msg: 'value two' },
    ]);
  });

  it('should interpolate message with details', () => {
    const details = { limit: 10 };
    const error = new ValidationError('fieldOne', 'Value must be less than {limit}', details);

    expect(error.getErrors()).toStrictEqual([{ field: 'fieldOne', msg: 'Value must be less than 10' }]);
  });

  it('should not interpolate message without details', () => {
    const error = new ValidationError('fieldOne', 'Value must be less than {limit}');

    expect(error.getErrors()).toStrictEqual([{ field: 'fieldOne', msg: 'Value must be less than {limit}' }]);
  });

  it('should not interpolate message when the placeholder is missing in details', () => {
    const details = { max: 20 };
    const error = new ValidationError('fieldOne', 'Value must be less than {limit}', details);

    expect(error.getErrors()).toStrictEqual([{ field: 'fieldOne', msg: 'Value must be less than {limit}' }]);
  });

  it('should not interpolate message when the placeholder is malformed', () => {
    const details = { limit: 10 };
    const error = new ValidationError('fieldOne', 'Value must be less than { lim it }', details);

    expect(error.getErrors()).toStrictEqual([{ field: 'fieldOne', msg: 'Value must be less than { lim it }' }]);
  });

  it('should create an instance with details', () => {
    const details = { min: 5, max: 10 };
    const error = new ValidationError('fieldOne', 'Value must be between {min} and {max}', details);

    expect(error.getErrorCount()).toBe(1);
    expect(error.getErrors()).toStrictEqual([{ field: 'fieldOne', msg: 'Value must be between 5 and 10' }]);
    expect(error.getErrors(true)).toStrictEqual([{ field: 'fieldOne', msg: 'Value must be between 5 and 10', details }]);
  });

  it('should return errors with details when withDetails is true', () => {
    const detailsOne = { min: 1 };
    const detailsTwo = { max: 100 };
    const error = new ValidationError('fieldOne', 'Min is {min}', detailsOne).addFieldError('fieldTwo', 'Max is {max}', detailsTwo);

    expect(error.getErrors(false)).toStrictEqual([
      { field: 'fieldOne', msg: 'Min is 1' },
      { field: 'fieldTwo', msg: 'Max is 100' },
    ]);
    expect(error.getErrors(true)).toStrictEqual([
      { field: 'fieldOne', msg: 'Min is 1', details: detailsOne },
      { field: 'fieldTwo', msg: 'Max is 100', details: detailsTwo },
    ]);
  });

  it('should combine errors and preserve details', () => {
    const detailsOne = { min: 5 };
    const errorOne = new ValidationError('fieldOne', 'Min is {min}', detailsOne);
    const errorTwo = new ValidationError('fieldTwo', 'Max is 10');
    const combinedError = ValidationError.combineErrors(errorOne, errorTwo);

    expect(combinedError.getErrors()).toStrictEqual([
      { field: 'fieldOne', msg: 'Min is 5' },
      { field: 'fieldTwo', msg: 'Max is 10' },
    ]);
    expect(combinedError.getErrors(true)).toStrictEqual([
      { field: 'fieldOne', msg: 'Min is 5', details: detailsOne },
      { field: 'fieldTwo', msg: 'Max is 10' },
    ]);
  });

  it('should not interpolate the message again when combining errors', () => {
    const details = { limit: 50, limitPlaceholder: '{limit}' };
    const errorOne = new ValidationError('fieldOne', 'Value must be less than {limitPlaceholder}', details);
    const errorTwo = new ValidationError('fieldTwo', 'Value must be less than {limit}', details);
    const combinedError = ValidationError.combineErrors(errorOne, errorTwo);

    expect(combinedError.getErrors()).toStrictEqual([
      { field: 'fieldOne', msg: 'Value must be less than {limit}' },
      { field: 'fieldTwo', msg: 'Value must be less than 50' },
    ]);
  });

  it('should return error object with details when withDetails is true', () => {
    const details = { value: 'test' };
    const error = new ValidationError('fieldOne', 'Invalid: {value}', details);

    expect(error.toObject()).toStrictEqual({
      code: 'VALIDATION_ERROR',
      type: 'VALIDATION_ERROR',
      message: 'Validation Error',
      fields: [{ field: 'fieldOne', msg: 'Invalid: test' }],
    });
    expect(error.toObject(true)).toStrictEqual({
      code: 'VALIDATION_ERROR',
      type: 'VALIDATION_ERROR',
      message: 'Validation Error',
      fields: [{ field: 'fieldOne', msg: 'Invalid: test', details }],
    });
  });

  it('should not mutate original errors array when getting errors', () => {
    const error = new ValidationError('fieldOne', 'value one');
    const errors = error.getErrors(true);
    errors.push({ field: 'fieldTwo', msg: 'value two' });

    expect(error.getErrors(true)).toStrictEqual([{ field: 'fieldOne', msg: 'value one' }]);
  });
});
