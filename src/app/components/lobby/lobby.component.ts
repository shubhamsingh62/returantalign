import { isPlatformBrowser } from '@angular/common';
import { Component, OnInit, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

type City = 'Mumbai' | 'Bangalore' | 'Delhi' | 'Hyderabad';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [FormsModule],
  template: `
    <main class="min-h-screen bg-gray-900 px-5 py-8 text-white sm:px-6 lg:px-8">
      <section class="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <div class="mb-8">
          <p class="mb-3 text-sm font-semibold uppercase tracking-[0.28em] text-cyan-400">
            Multiplayer dinner picker
          </p>
          <h1 class="text-5xl font-black tracking-tight text-white sm:text-6xl">
            Dine<span class="text-cyan-400">Align</span>
          </h1>
          <p class="mt-4 text-base leading-7 text-gray-300">
            Pick your area, create a room, and let the group swipe into a restaurant match.
          </p>
        </div>

        @if (!roomId()) {
          <form
            class="min-h-[25rem] rounded-lg border border-gray-700 bg-gray-800 p-5 shadow-2xl shadow-cyan-950/20 transition-all duration-300 sm:p-6"
            (ngSubmit)="startDineAlign()"
          >
            @if (isDetectingLocation()) {
              <div class="flex min-h-[20rem] flex-col items-center justify-center text-center">
                <div class="mb-5 size-14 rounded-full border-2 border-gray-700 border-t-cyan-400 animate-spin"></div>
                <h2 class="text-2xl font-bold text-white">Detecting your location...</h2>
                <p class="mt-3 max-w-xs text-sm leading-6 text-gray-400">
                  We will use it only to preselect your city for faster room creation.
                </p>
              </div>
            } @else {
              <div class="mb-6 rounded-md border border-cyan-400/20 bg-cyan-500/10 px-4 py-3">
                <p class="text-sm font-semibold text-cyan-200">
                  @if (locationWasDetected()) {
                    Location detected: {{ selectedCity() }}
                  } @else {
                    Choose your city manually
                  }
                </p>
                <p class="mt-1 text-xs leading-5 text-gray-400">
                  Areas update instantly based on the selected city.
                </p>
              </div>

              @if (errorMessage()) {
                <p class="mb-5 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-100">
                  {{ errorMessage() }}
                </p>
              }

              <div class="space-y-5">
                @if (showManualCitySelection()) {
                  <div>
                    <label for="city" class="mb-2 block text-sm font-medium text-gray-200">
                      City
                    </label>
                    <select
                      id="city"
                      name="city"
                      [ngModel]="selectedCity()"
                      (ngModelChange)="selectCity($event)"
                      class="h-12 w-full rounded-md border border-gray-700 bg-gray-900 px-4 text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
                    >
                      <option value="" disabled>Select city</option>
                      @for (city of cities; track city) {
                        <option [value]="city">{{ city }}</option>
                      }
                    </select>
                  </div>
                }

                @if (selectedCity()) {
                  <div>
                    <label for="area" class="mb-2 block text-sm font-medium text-gray-200">
                      Area
                    </label>
                    <select
                      id="area"
                      name="area"
                      [ngModel]="selectedArea()"
                      (ngModelChange)="selectedArea.set($event)"
                      class="h-12 w-full rounded-md border border-gray-700 bg-gray-900 px-4 text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
                    >
                      <option value="" disabled>Select area</option>
                      @for (area of availableAreas(); track area) {
                        <option [value]="area">{{ area }}</option>
                      }
                    </select>
                  </div>
                }
              </div>

              <button
                type="submit"
                [disabled]="!selectedArea() || isCreatingRoom()"
                class="mt-7 flex h-12 w-full items-center justify-center rounded-md bg-cyan-500 px-5 text-sm font-bold text-gray-950 transition hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:bg-gray-600 disabled:text-gray-300"
              >
                @if (isCreatingRoom()) {
                  Creating room...
                } @else {
                  Start DineAlign
                }
              </button>
            }
          </form>
        } @else {
          <div class="min-h-[25rem] rounded-lg border border-cyan-400/30 bg-gray-800 p-5 shadow-2xl shadow-cyan-950/30 transition-all duration-300 sm:p-6">
            <div class="mb-6 flex items-center gap-3">
              <div class="flex size-11 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-300">
                <span class="text-xl font-black">✓</span>
              </div>
              <div>
                <h2 class="text-2xl font-bold text-white">Room Created</h2>
                <p class="text-sm text-gray-400">{{ selectedArea() }}, {{ selectedCity() }}</p>
              </div>
            </div>

            <label for="roomLink" class="mb-2 block text-sm font-medium text-gray-200">
              Room link
            </label>
            <input
              id="roomLink"
              readonly
              [value]="roomUrl()"
              class="h-12 w-full rounded-md border border-gray-700 bg-gray-900 px-4 text-sm text-gray-200 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
            />

            @if (copyStatus()) {
              <p class="mt-3 text-sm font-medium text-cyan-300">{{ copyStatus() }}</p>
            }

            <div class="mt-6 grid gap-3">
              <a
                [href]="whatsappShareLink()"
                target="_blank"
                rel="noopener noreferrer"
                class="flex h-12 items-center justify-center rounded-md bg-cyan-500 px-5 text-sm font-bold text-gray-950 transition hover:bg-cyan-400"
              >
                Send to WhatsApp
              </a>
              <div class="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  (click)="copyRoomLink()"
                  class="flex h-12 items-center justify-center rounded-md border border-gray-600 bg-gray-900 px-5 text-sm font-bold text-white transition hover:border-cyan-400 hover:text-cyan-300"
                >
                  Copy Link
                </button>
                <button
                  type="button"
                  (click)="enterRoom()"
                  class="flex h-12 items-center justify-center rounded-md border border-gray-600 bg-gray-900 px-5 text-sm font-bold text-white transition hover:border-cyan-400 hover:text-cyan-300"
                >
                  Enter Room
                </button>
              </div>
            </div>
          </div>
        }
      </section>
    </main>
  `,
})
export class LobbyComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly areaMap: Record<City, string[]> = {
    Mumbai: ['Bandra', 'Andheri', 'Juhu'],
    Bangalore: ['Indiranagar', 'Koramangala', 'Whitefield'],
    Delhi: ['Connaught Place', 'Hauz Khas', 'Saket'],
    Hyderabad: ['Jubilee Hills', 'Hitec City', 'Banjara Hills'],
  };

  readonly cities = Object.keys(this.areaMap) as City[];
  readonly isDetectingLocation = signal(true);
  readonly locationWasDetected = signal(false);
  readonly showManualCitySelection = signal(false);
  readonly isCreatingRoom = signal(false);
  readonly errorMessage = signal('');
  readonly selectedCity = signal<City | ''>('');
  readonly selectedArea = signal('');
  readonly roomId = signal('');
  readonly copyStatus = signal('');

  readonly availableAreas = computed(() => {
    const city = this.selectedCity();
    return city ? this.areaMap[city] : [];
  });

  readonly roomUrl = computed(() => {
    const id = this.roomId();
    return id ? `${this.origin}/room/${id}` : '';
  });

  readonly whatsappShareLink = computed(() => {
    const text = `Join my DineAlign room for ${this.selectedArea()}: ${this.roomUrl()}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  });

  ngOnInit(): void {
    this.detectLocation();
  }

  selectCity(city: City | ''): void {
    this.selectedCity.set(city);
    this.selectedArea.set('');
  }

  async startDineAlign(): Promise<void> {
    const area = this.selectedArea();

    if (!area || this.isCreatingRoom()) {
      return;
    }

    this.isCreatingRoom.set(true);
    this.errorMessage.set('');

    try {
      const roomId = await this.supabase.createRoom(area);
      this.roomId.set(roomId);
    } catch (error) {
      console.error('[DineAlign] Room creation failed:', error);
      this.errorMessage.set('Could not create the room. Please try again.');
    } finally {
      this.isCreatingRoom.set(false);
    }
  }

  async copyRoomLink(): Promise<void> {
    const link = this.roomUrl();

    if (!link) {
      return;
    }

    try {
      if (this.isBrowser && navigator.clipboard) {
        await navigator.clipboard.writeText(link);
      }

      this.copyStatus.set('Link copied');
    } catch {
      this.copyStatus.set('Copy failed. Select the link above.');
    }

    window.setTimeout(() => this.copyStatus.set(''), 1800);
  }

  enterRoom(): void {
    const id = this.roomId();

    if (id) {
      void this.router.navigate(['/room', id]);
    }
  }

  private detectLocation(): void {
    if (!this.isBrowser || !navigator.geolocation) {
      this.showManualLocationFlow();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        this.selectedCity.set('Hyderabad');
        this.selectedArea.set('');
        this.locationWasDetected.set(true);
        this.showManualCitySelection.set(false);
        this.isDetectingLocation.set(false);
      },
      () => this.showManualLocationFlow(),
      {
        enableHighAccuracy: false,
        maximumAge: 300000,
        timeout: 6000,
      },
    );
  }

  private showManualLocationFlow(): void {
    this.locationWasDetected.set(false);
    this.showManualCitySelection.set(true);
    this.selectedCity.set('');
    this.selectedArea.set('');
    this.isDetectingLocation.set(false);
  }

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  private get origin(): string {
    return this.isBrowser ? window.location.origin : 'http://localhost:4200';
  }
}
