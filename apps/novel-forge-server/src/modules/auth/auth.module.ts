import { forwardRef, type Import, Module } from '@shadow-library/app';
import { AuthModule } from '@shadow-library/auth/module';

// forwardRef because @Module deep-freezes its metadata object; the wrapper keeps the pre-built
// dynamic module (and the live AuthClient inside it) out of the frozen graph. The cast is required
// only because `Import` types ForwardReference around classes, while the registry resolves any
// `forwardRef()` result — dynamic modules included.
const IdentityAuthModule = AuthModule.forRoot({ routes: { basePath: '/api/auth' } });

@Module({
  imports: [forwardRef(() => IdentityAuthModule) as unknown as Import],
})
export class AppAuthModule {}
