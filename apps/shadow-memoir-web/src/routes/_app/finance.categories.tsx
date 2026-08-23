import { createFileRoute } from '@tanstack/react-router';

import { CategoriesScreen } from '@/features/finance';

export const Route = createFileRoute('/_app/finance/categories')({ component: CategoriesScreen });
