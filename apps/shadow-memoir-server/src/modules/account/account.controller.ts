/**
 * Importing npm packages
 */
import { Authenticated, RequireScope } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Patch, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AccountPatchDto, AccountResponseDto, OnboardingDto } from './account.dto';
import { AccountService, type AccountView } from './account.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/account')
@Authenticated()
@RequireScope('memoir:account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get()
  @RespondFor(200, AccountResponseDto)
  get(): Promise<AccountView> {
    return this.accountService.get();
  }

  @Patch()
  @RespondFor(200, AccountResponseDto)
  patch(@Body() body: AccountPatchDto): Promise<AccountView> {
    return this.accountService.patch(body);
  }

  @Post('/onboarding')
  @RespondFor(200, AccountResponseDto)
  onboard(@Body() body: OnboardingDto): Promise<AccountView> {
    return this.accountService.onboard(body);
  }
}
