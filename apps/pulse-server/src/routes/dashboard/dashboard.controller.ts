/**
 * Importing npm packages
 */
import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { DashboardStats } from './dtos';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/dashboard')
export class DashboardController {
  @Get('/stats')
  @RespondFor(200, DashboardStats)
  getStats(): DashboardStats {
    return {
      today: {
        date: 2025_01_01,
        overall: {
          total: 100,
          succeeded: 80,
          failed: 15,
          pending: 5,
        },
        channels: {
          email: { total: 50, succeeded: 40, failed: 7, pending: 3 },
          sms: { total: 30, succeeded: 25, failed: 4, pending: 1 },
          push: { total: 20, succeeded: 15, failed: 4, pending: 1 },
        },
      },
      trend: {
        fromDate: 2024_12_27,
        toDate: 2024_12_31,
        stats: [
          { date: 2024_12_27, total: 100, succeeded: 80, failed: 15, pending: 5 },
          { date: 2024_12_28, total: 90, succeeded: 70, failed: 15, pending: 5 },
          { date: 2024_12_29, total: 95, succeeded: 75, failed: 15, pending: 5 },
          { date: 2024_12_30, total: 85, succeeded: 65, failed: 15, pending: 5 },
          { date: 2024_12_31, total: 110, succeeded: 90, failed: 15, pending: 5 },
        ],
      },
    };
  }
}
