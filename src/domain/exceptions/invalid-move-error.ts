import { DomainError } from './domain-error';

export class InvalidMoveError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}
