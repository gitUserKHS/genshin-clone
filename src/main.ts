import './styles/main.css';
import { GameEngine } from './core/GameEngine';

const app = document.getElementById('app');
if (app) {
  new GameEngine(app);
}
