import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, ViewChild } from '@angular/core';

export interface NewsItem {
  id?: string;
  title: string;
  excerpt: string;
  date: string;
  imageLabel?: string;
  imageUrl?: string;
  linkUrl?: string;
}

@Component({
  selector: 'app-news-carousel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './news-carousel.component.html',
})
export class NewsCarouselComponent {
  @Input() title = 'News & Updates';
  @Input() items: NewsItem[] = [];

  @ViewChild('track', { static: true }) track!: ElementRef<HTMLDivElement>;

  scroll(direction: 'left' | 'right'): void {
    const node = this.track?.nativeElement;
    if (!node) {
      return;
    }

    node.scrollBy({
      left: direction === 'left' ? -352 : 352,
      behavior: 'smooth',
    });
  }
}
