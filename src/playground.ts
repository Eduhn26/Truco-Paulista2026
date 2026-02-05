import { Hand } from './domain/entities/hand';
import { Card } from './domain/value-objects/card';

// vira = 7 → manilha = Q
const hand = new Hand('7');

console.log('Iniciando mão...');

// Rodada 1
hand.play('P1', Card.from('QD')); // manilha forte
hand.play('P2', Card.from('QC')); // manilha fraca

console.log('Após rodada 1, finalizada?', hand.isFinished());

// Rodada 2
hand.play('P1', Card.from('3D'));
hand.play('P2', Card.from('AD'));

console.log('Após rodada 2, finalizada?', hand.isFinished());
console.log('Vencedor da mão:', hand.getWinner());
