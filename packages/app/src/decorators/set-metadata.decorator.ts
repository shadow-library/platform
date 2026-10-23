/** Stores `value` under `key` on the class or method; read it back with `Reflector`. */
export function SetMetadata<K = string, V = any>(key: K, value: V): MethodDecorator & ClassDecorator {
  return function (target: object, _propertyKey?: string | symbol, descriptor?: PropertyDescriptor) {
    if (descriptor?.value) {
      Reflect.defineMetadata(key, value, descriptor.value);
      return descriptor;
    }

    Reflect.defineMetadata(key, value, target);
    return target;
  } as MethodDecorator & ClassDecorator;
}
