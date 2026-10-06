import { isPlatformBrowser } from '@angular/common';
import { CdkDragEnd, CdkDragMove, DragDropModule } from '@angular/cdk/drag-drop';
import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import confetti from 'canvas-confetti';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../../services/supabase.service';

type SwipeDirection = 'left' | 'right';

type RoomRow = {
  id: string;
  target_neighborhood: string;
  status: string;
  winning_restaurant_id: string | null;
};

type RestaurantRow = {
  id: string;
  name: string;
  area?: string | null;
  rating?: number | null;
  review_count?: string | number | null;
  images?: string[] | null;
  image_urls?: string[] | null;
  image_url?: string | null;
  cuisines?: string[] | string | null;
  cost_for_two?: string | null;
  must_try?: string | null;
  open_until: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
};

type RestaurantCard = {
  id: string;
  name: string;
  rating: number;
  reviewCount: string;
  images: string[];
  activeImageIndex: number;
  cuisines: string[];
  costForTwo: string;
  mustTry: string;
  openUntil: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
};

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [DragDropModule],
  templateUrl: './room.component.html',
})
export class RoomComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly supabase = inject(SupabaseService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly swipeThreshold = 120;
  private roomSubscription: RealtimeChannel | null = null;

  readonly roomId = signal('');
  readonly userId = signal('');
  readonly targetNeighborhood = signal('');
  readonly isLoading = signal(true);
  readonly isSwiping = signal(false);
  readonly errorMessage = signal('');
  readonly swipeIntent = signal<SwipeDirection | null>(null);
  readonly swipeAnimation = signal<SwipeDirection | null>(null);
  readonly restaurants = signal<RestaurantCard[]>([]);
  readonly isMatchFound = signal(false);
  readonly winningRestaurantId = signal<string | null>(null);
  readonly dismissedMatch = signal(false);

  readonly topRestaurant = computed(() => this.restaurants()[0] ?? null);
  readonly winningRestaurant = computed(() => {
    const id = this.winningRestaurantId();
    return id ? this.restaurants().find((restaurant) => restaurant.id === id) ?? null : null;
  });

  ngOnInit(): void {
    this.roomId.set(this.route.snapshot.paramMap.get('id') ?? '');
    this.userId.set(this.getOrCreateUserId());

    void this.loadRoom();
  }

  ngOnDestroy(): void {
    if (this.roomSubscription) {
      void this.supabase.client.removeChannel(this.roomSubscription);
    }
  }

  onDragMoved(event: CdkDragMove): void {
    const distanceX = event.distance.x;

    if (distanceX > 42) {
      this.swipeIntent.set('right');
      return;
    }

    if (distanceX < -42) {
      this.swipeIntent.set('left');
      return;
    }

    this.swipeIntent.set(null);
  }

  onSwipeEnd(event: CdkDragEnd): void {
    const restaurant = this.topRestaurant();
    const distanceX = event.distance.x;

    this.swipeIntent.set(null);

    if (!restaurant || Math.abs(distanceX) < this.swipeThreshold) {
      event.source.reset();
      return;
    }

    void this.commitSwipe(distanceX > 0 ? 'right' : 'left', restaurant);
  }

  previousImage(restaurant: RestaurantCard, event: Event): void {
    event.stopPropagation();
    this.updateActiveImage(restaurant.id, -1);
  }

  nextImage(restaurant: RestaurantCard, event: Event): void {
    event.stopPropagation();
    this.updateActiveImage(restaurant.id, 1);
  }

  triggerSwipe(direction: SwipeDirection): void {
    const restaurant = this.topRestaurant();

    if (!restaurant || this.isSwiping() || this.swipeAnimation()) {
      return;
    }

    this.swipeIntent.set(direction);
    this.swipeAnimation.set(direction);

    window.setTimeout(() => {
      void this.commitSwipe(direction, restaurant);
    }, 240);
  }

  cardTransform(index: number): string {
    if (index === 0) {
      const direction = this.swipeAnimation();

      if (direction === 'right') {
        return 'translateX(145%) rotate(16deg)';
      }

      if (direction === 'left') {
        return 'translateX(-145%) rotate(-16deg)';
      }

      return 'translateY(0) scale(1)';
    }

    return `translateY(${index * 12}px) scale(${1 - index * 0.04})`;
  }

  directionsUrl(restaurant: RestaurantCard | null): string {
    if (!restaurant) {
      return 'https://www.google.com/maps';
    }

    if (restaurant.latitude !== null && restaurant.longitude !== null) {
      return `https://www.google.com/maps/search/?api=1&query=${restaurant.latitude},${restaurant.longitude}`;
    }

    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${restaurant.name} ${this.targetNeighborhood()}`,
    )}`;
  }

  dismissMatch(): void {
    this.dismissedMatch.set(true);
  }

  private async loadRoom(): Promise<void> {
    const roomId = this.roomId();

    if (!roomId) {
      this.errorMessage.set('Room link is missing a room id.');
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const room = await this.fetchRoom(roomId);
      this.targetNeighborhood.set(room.target_neighborhood);

      const restaurants = await this.fetchRestaurants(room.target_neighborhood);
      this.restaurants.set(restaurants);

      if (room.status === 'matched' && room.winning_restaurant_id) {
        await this.handleMatch(room.winning_restaurant_id);
      }

      this.subscribeToRoom(roomId);
    } catch (error) {
      console.error('[DineAlign] Room load failed:', error);
      this.errorMessage.set('Could not load this room. Check your Supabase tables and try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async fetchRoom(roomId: string): Promise<RoomRow> {
    const { data, error } = await this.supabase.client
      .from('rooms')
      .select('id,target_neighborhood,status,winning_restaurant_id')
      .eq('id', roomId)
      .single();

    if (error) {
      throw error;
    }

    return data as RoomRow;
  }

  private async fetchRestaurants(targetNeighborhood: string): Promise<RestaurantCard[]> {
    const { data, error } = await this.supabase.client
      .from('restaurants')
      .select('*')
      .eq('area', targetNeighborhood);

    if (error) {
      throw error;
    }

    return ((data ?? []) as RestaurantRow[]).map((restaurant) => this.mapRestaurant(restaurant));
  }

  private subscribeToRoom(roomId: string): void {
    this.roomSubscription = this.supabase.client
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          const updatedRoom = payload.new as RoomRow;

          if (updatedRoom.status === 'matched' && updatedRoom.winning_restaurant_id) {
            void this.handleMatch(updatedRoom.winning_restaurant_id);
          }
        },
      )
      .subscribe();
  }

  private async handleMatch(restaurantId: string): Promise<void> {
    this.winningRestaurantId.set(restaurantId);

    if (!this.restaurants().some((restaurant) => restaurant.id === restaurantId)) {
      await this.fetchWinningRestaurant(restaurantId);
    }

    this.dismissedMatch.set(false);
    this.isMatchFound.set(true);
    this.fireConfetti();
  }

  private async fetchWinningRestaurant(restaurantId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('restaurants')
      .select('*')
      .eq('id', restaurantId)
      .single();

    if (error || !data) {
      console.error('[DineAlign] Could not fetch winning restaurant:', error?.message);
      return;
    }

    const winningRestaurant = this.mapRestaurant(data as RestaurantRow);
    this.restaurants.update((current) => [winningRestaurant, ...current]);
  }

  private async commitSwipe(direction: SwipeDirection, restaurant: RestaurantCard): Promise<void> {
    if (this.isSwiping()) {
      return;
    }

    this.isSwiping.set(true);

    try {
      const { error } = await this.supabase.client.from('swipes').insert({
        room_id: this.roomId(),
        user_id: this.userId(),
        restaurant_id: restaurant.id,
        direction,
      });

      if (error) {
        throw error;
      }

      console.log(`[DineAlign] ${direction === 'right' ? 'Align' : 'Pass'}:`, {
        roomId: this.roomId(),
        userId: this.userId(),
        restaurantId: restaurant.id,
      });

      this.restaurants.update((current) => current.filter((item) => item.id !== restaurant.id));
    } catch (error) {
      console.error('[DineAlign] Swipe insert failed:', error);
      this.errorMessage.set('Could not save your swipe. Please try again.');
    } finally {
      this.isSwiping.set(false);
      this.swipeIntent.set(null);
      this.swipeAnimation.set(null);
    }
  }

  private updateActiveImage(restaurantId: string, delta: number): void {
    this.restaurants.update((restaurants) =>
      restaurants.map((restaurant) => {
        if (restaurant.id !== restaurantId) {
          return restaurant;
        }

        const activeImageIndex =
          (restaurant.activeImageIndex + delta + restaurant.images.length) % restaurant.images.length;

        return {
          ...restaurant,
          activeImageIndex,
        };
      }),
    );
  }

  private mapRestaurant(row: RestaurantRow): RestaurantCard {
    const images = row.images ?? row.image_urls ?? (row.image_url ? [row.image_url] : []);

    return {
      id: String(row.id),
      name: row.name,
      rating: Number(row.rating ?? 4.4),
      reviewCount: String(row.review_count ?? 'New'),
      images: images.length > 0 ? images : this.placeholderImages(),
      activeImageIndex: 0,
      cuisines: this.normalizeCuisines(row.cuisines),
      costForTwo: row.cost_for_two ?? 'Cost varies',
      mustTry: row.must_try ?? 'Ask the table for today\'s best pick',
      openUntil: row.open_until?.trim() ?? '',
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      address: row.address ?? '',
    };
  }

  private normalizeCuisines(cuisines: RestaurantRow['cuisines']): string[] {
    if (Array.isArray(cuisines)) {
      return cuisines;
    }

    if (typeof cuisines === 'string' && cuisines.trim()) {
      return cuisines.split(',').map((item) => item.trim());
    }

    return ['Restaurant'];
  }

  private placeholderImages(): string[] {
    return [
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=80',
    ];
  }

  private getOrCreateUserId(): string {
    if (!this.isBrowser) {
      return this.createId();
    }

    const existingUserId = localStorage.getItem('dinealign_user_id');

    if (existingUserId) {
      return existingUserId;
    }

    const userId = this.createId();
    localStorage.setItem('dinealign_user_id', userId);
    return userId;
  }

  private createId(): string {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }

    return Math.random().toString(36).slice(2, 12);
  }

  private fireConfetti(): void {
    if (!this.isBrowser) {
      return;
    }

    void confetti({
      particleCount: 160,
      spread: 76,
      origin: { y: 0.62 },
      colors: ['#22d3ee', '#ffffff', '#34d399', '#facc15'],
    });
  }

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }
}
