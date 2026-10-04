import { Routes } from '@angular/router';
import { LobbyComponent } from './components/lobby/lobby.component';
import { RoomComponent } from './components/room/room.component';

export const routes: Routes = [
  { path: '', component: LobbyComponent },
  { path: 'room/:id', component: RoomComponent }
];
