import { createFileRoute } from '@tanstack/react-router';

import { CategoriesScreen } from '@/features/finance';

export const Route = createFileRoute('/_account/_app/finance/categories')({ staticData: { title: 'Categories' }, component: CategoriesScreen });
