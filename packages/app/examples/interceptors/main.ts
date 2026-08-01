/**
 * Importing npm packages
 */
import { ShadowFactory } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { AppModule } from './app.module';
import { CatService } from './cat.service';
import { LoggerService } from './logger.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const app = await ShadowFactory.create(AppModule);
await app.start();

const loggerService = app.select(AppModule).get(LoggerService);
const catService = app.select(AppModule).get(CatService);

loggerService.separator();

const cats = catService.getCats();
loggerService.log(`Cats: ${cats.map(cat => cat.name).join(', ')}`);
const cachedCats = catService.getCats();
loggerService.log(`Cached Cats: ${cachedCats.map(cat => cat.name).join(', ')}`);

loggerService.separator();

const cat2 = catService.getCat('2');
loggerService.log(`Cat by ID (2): ${cat2?.name}`);
const cachedCat2 = catService.getCat('2');
loggerService.log(`Cached Cat by ID (2): ${cachedCat2?.name}`);

loggerService.separator();

const cat3 = catService.getCat('3');
loggerService.log(`Cat by ID (3): ${cat3?.name}`);
const cachedCat3 = catService.getCat('3');
loggerService.log(`Cached Cat by ID (3): ${cachedCat3?.name}`);

loggerService.separator();

const jerry = await catService.getCatByName('Jerry');
loggerService.log(`Cat by Name (Jerry): ${jerry?.id}`);
const cachedJerry = await catService.getCatByName('Jerry');
loggerService.log(`Cached Cat by Name (Jerry): ${cachedJerry?.id}`);
loggerService.log(`Waiting for cache to expire...`);
await Bun.sleep(15);
const newJerry = await catService.getCatByName('Jerry');
loggerService.log(`New Cat by Name (Jerry) after cache expiry: ${newJerry?.id}`);

loggerService.separator();

await app.stop();
