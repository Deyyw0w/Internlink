import { Component } from '@angular/core';

@Component({
  selector: 'app-usl-programs-embed',
  standalone: true,
  imports: [],
  templateUrl: './usl-programs-embed.component.html',
  styleUrl: './usl-programs-embed.component.css'
})
export class UslProgramsEmbedComponent {
  readonly uslProgramsUrl = 'https://usl.edu.ph/programs/';
}
