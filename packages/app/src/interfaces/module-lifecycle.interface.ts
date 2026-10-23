export interface OnModuleInit {
  onModuleInit(): any | Promise<any>;
}

export interface OnModuleDestroy {
  onModuleDestroy(): any | Promise<any>;
}

export interface OnApplicationReady {
  onApplicationReady(): any | Promise<any>;
}

export interface OnApplicationStop {
  onApplicationStop(): any | Promise<any>;
}
