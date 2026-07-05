/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export class IllustrationParams {
  projectId!: string;
  entityKey!: string;
}

export class StartIllustrationBody {
  instruction?: string;
  noChat?: boolean;
}

export class RefineIllustrationBody {
  sessionId!: string;
  instruction!: string;
}

export class SaveIllustrationBody {
  sessionId!: string;
}

export class CancelIllustrationBody {
  sessionId!: string;
}

/**
 * Declaring the constants
 */
