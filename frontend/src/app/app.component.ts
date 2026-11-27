import { Component, NgZone, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import * as L from 'leaflet';

@Component({
  selector: 'app-root', standalone: true, imports: [CommonModule, FormsModule],
  template: `
<!-- ============ LOGIN / REGISTER ============ -->
<section id="auth" *ngIf="!token">
  <div class="box">
    <div class="logo">K</div><div class="eyebrow">Karnataka / Many Worlds</div>
    <h1 style="font-size:34px">{{ reg ? 'Join the journey' : 'Welcome back' }}</h1>
    <p style="color:var(--mut);margin:4px 0 0">Sign in to explore Karnataka, one experience at a time.</p>
    <div class="tabs"><button [class.on]="!reg" (click)="setReg(false)">Login</button><button [class.on]="reg" (click)="setReg(true)">Create account</button></div>
    <ng-container *ngIf="reg"><label>Full name</label><input [(ngModel)]="f.name" maxlength="60" placeholder="Your name"><label>I am a</label><select [(ngModel)]="f.role"><option value="traveller">Traveller</option><option value="owner">Resort owner</option></select></ng-container>
    <label>Email address</label><input [(ngModel)]="f.email" type="email" placeholder="you@example.com">
    <label>Password</label><input [(ngModel)]="f.password" type="password" placeholder="Enter your password" (keyup.enter)="submit()">
    <ul class="rules" *ngIf="reg"><li *ngFor="let r of rules" [class.ok]="r.test(f.password)">{{ r.label }}</li></ul>
    <p class="err" [class.good]="ok">{{ msg }}</p>
    <button class="btn" style="width:100%" [disabled]="authBusy" (click)="submit()">{{ authBusy ? 'Please wait…' : (reg ? 'Create account →' : 'Login →') }}</button>
  </div>
</section>

<!-- ============ APP ============ -->
<ng-container *ngIf="token">
<div class="toast" *ngIf="toast">{{ toast }}</div>
<nav><div class="brand"><div class="logo" style="width:28px;height:28px;font-size:14px">K</div>KARNATAKA / MANY WORLDS</div>
  <a [class.on]="page==='explore'" (click)="page='explore'">Explore</a><a [class.on]="page==='plan'" (click)="page='plan'">Plan a Trip</a><a [class.on]="page==='map'" (click)="openMap()">Map</a><a [class.on]="page==='trips'" (click)="openTrips()">My Trips</a> <a *ngIf="role==='owner'" [class.on]="page==='owner'" (click)="openOwner()">Owner portal</a><a *ngIf="role==='admin'" [class.on]="page==='admin'" (click)="openAdmin()">Admin</a>
  <button class="btn ghost" (click)="toggleDark()">{{ dark ? '☀' : '☾' }}</button><span style="color:var(--mut)">{{ name }}</span><button class="btn ghost" (click)="logout()">Log out</button></nav>
<main>
 <ng-container *ngIf="page==='explore'">
  <div class="hero"><div class="eyebrow">One state, many worlds</div><h1>Find your next story.</h1><p>Discover the hidden corners and unforgettable experiences of {{ regionInfo?.name || 'Karnataka' }}.</p></div>
  <div class="regionbar" *ngIf="regionInfo"><b>{{ regionInfo.name }}</b> · {{ regionInfo.description }} · Reference hub: <b>{{ regionInfo.hub?.name }}</b> · {{ regionInfo.destinations.length }} destinations</div>
  <div class="search"><h3>Your next story starts here.</h3>
    <input [(ngModel)]="q" (keyup.enter)="searchEnter()" (input)="load()" placeholder="Search destinations… (Enter to plan)">
    <button class="btn" style="background:var(--gold);color:var(--gd)" (click)="searchEnter()">Search</button>
    <select [(ngModel)]="regionId" (change)="regionChanged()"><option *ngFor="let r of regions" [value]="r._id">{{ r.name }}</option></select>
    <select [(ngModel)]="tier" (change)="load()"><option value="">Any budget tier</option><option value="LOW">LOW (&lt; ₹1,500/day)</option><option value="MEDIUM">MEDIUM (₹1,500–3,000)</option><option value="HIGH">HIGH (&gt; ₹3,000)</option></select></div>
  <p class="err" *ngIf="searchMsg" style="margin:-10px 0 14px">{{ searchMsg }}</p>
  <ng-container *ngIf="places.length"><div class="eyebrow">Search results</div><h2 style="font-size:26px">Places matching "{{ q }}"</h2>
   <p style="color:var(--mut);margin:4px 0 14px">Click a place to see the map, nearby places and plan a budget trip.</p>
   <div class="grid" style="margin-bottom:30px"><div class="card" *ngFor="let p of places" (click)="openExt(p)"><div class="art img" [style.background-image]="p.image ? 'url(' + p.image + ')' : null"><span class="tag">{{ p.type }}</span></div><div class="b"><h3>{{ p.name }}</h3><p>{{ p.address }}</p><span class="more">PLAN A TRIP ↗</span></div></div></div></ng-container>
  <p *ngIf="offers.length" class="offer">🎟 Offers: <b *ngFor="let o of offers">{{ o.code }} ({{ o.percent }}% off, up to ₹{{ o.maxDiscount | number }}) &nbsp;</b> Apply at checkout when planning a trip.</p>
  <ng-container *ngIf="recent.length"><div class="eyebrow">Recently viewed</div><div class="near"><button *ngFor="let r of recent" (click)="openDest(r.id)">{{ r.name }}</button></div></ng-container>
  <ng-container *ngFor="let grp of [{ t: 'Top-rated resorts & stays', k: 'Recommended', l: topStays }, { t: 'Budget-friendly stays', k: 'Save more', l: budgetStays }]"><ng-container *ngIf="grp.l.length"><div class="eyebrow">{{ grp.k }}</div><h2 style="font-size:26px">{{ grp.t }}</h2>
   <div class="grid" style="margin:14px 0 30px"><div class="card" *ngFor="let s of grp.l" (click)="openDest(s.placeId)"><div class="art img" [style.background-image]="s.image ? 'url(' + s.image + ')' : null"></div>
    <div class="b"><h3>{{ s.name }}</h3><p>{{ s.kind }} · {{ s.place }} · ₹{{ s.price | number }}/night</p><p style="color:var(--gold)">★ {{ s.avg ?? 'New' }} <span style="color:var(--mut)">({{ s.count }} ratings)</span></p></div></div></div></ng-container></ng-container>
  <div class="eyebrow">Discover</div>
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:6px">
    <h2 style="font-size:26px">Explore by theme</h2>
    <span style="color:var(--mut);font-size:13px;font-weight:600">Showing {{ dests.length }} of {{ totalCount }} destinations in {{ regionInfo?.name || 'Region' }}</span>
  </div>
  <div class="chips">
    <button class="chip" [class.on]="!cat" (click)="setCat('')">All</button>
    <button class="chip" [class.on]="onlyFav" (click)="onlyFav = !onlyFav; load()">♥ Favourites</button>
    <button class="chip" *ngFor="let c of cats" [class.on]="cat===c" (click)="setCat(c)">{{ c }}</button>
    <button class="chip" *ngIf="q || cat || tier || onlyFav" (click)="clearFilters()" style="color:var(--red);border-color:var(--red)">✕ Clear filters</button>
  </div>
  <div class="grid" *ngIf="dests.length"><div class="card" *ngFor="let d of dests" (click)="openDest(d.id)">
    <div class="art" [ngClass]="d.category[0]" [class.img]="d.image" [style.background-image]="d.image ? 'url(' + d.image + ')' : null"><span class="tag">{{ d.category.join(' · ') }}</span><button class="heart" (click)="toggleFav(d, $event)">{{ favs.includes(d._id) ? '♥' : '♡' }}</button></div>
    <div class="b"><h3>{{ d.name }}</h3><p>{{ d.description }}</p><p>{{ d.tier }} · ₹{{ d.dailyCost }}/day <span *ngIf="d.avgRating">· ★ {{ d.avgRating }}</span></p><p *ngIf="d.bestTime">🗓 Best time: {{ d.bestTime }}</p><span class="more">EXPLORE PLACE ↗</span></div></div></div>
  <div *ngIf="loading" class="loading">Loading destinations…</div>
  <div *ngIf="!loading && loadErr" class="notice">{{ loadErr }}</div>
  <div *ngIf="!loading && !loadErr && !dests.length && !places.length" style="padding:36px 20px;text-align:center;background:var(--card);border-radius:16px;border:1px solid var(--line);margin:16px 0">
    <p style="font-size:17px;margin:0 0 8px;color:var(--head);font-weight:600">No destinations match your search or filter criteria.</p>
    <p style="color:var(--mut);margin:0 0 14px;font-size:13px">Try selecting a different theme, clearing your budget filter, or resetting your search keywords.</p>
    <button class="btn ghost" (click)="clearFilters()">Clear all filters</button>
  </div>

 </ng-container>
 <ng-container *ngIf="page==='trips'"><h1>My Trips</h1><p style="color:var(--mut)">Itineraries saved to your account.</p>
  <div class="grid"><div class="card" *ngFor="let t of trips" (click)="openTrip(t._id)"><div class="b"><h3>{{ t.title }}</h3><p>{{ t.result.days }} days · ₹{{ t.result.budget | number }}</p><span class="more">VIEW PLAN ↗</span></div></div></div>
  <p *ngIf="!trips.length">No trips yet — search a place on Explore to start planning.</p>
  <ng-container *ngIf="myBookings.length"><h2 style="font-size:24px;margin:26px 0 6px">My bookings</h2><table><tr><th>Ref</th><th>Stay</th><th>Place</th><th>Check-in</th><th>Nights</th><th>Amount</th></tr>
   <tr *ngFor="let b of myBookings"><td>{{ b.ref }}</td><td>{{ b.stayName }}</td><td>{{ b.place }}</td><td>{{ b.checkIn | date:'mediumDate' }}</td><td>{{ b.nights }}</td><td>₹{{ b.amount | number }}</td></tr></table></ng-container></ng-container>
 <ng-container *ngIf="page==='owner' && own">
  <div class="eyebrow">Resort owner portal</div><h1>Your resorts &amp; live bookings</h1><p style="color:var(--mut)">New bookings from travellers appear here the moment they are made.</p>
  <div class="row" style="margin:14px 0"><div class="card"><div class="b"><h3>{{ own.stays.length }}</h3><p>Your stays</p></div></div><div class="card"><div class="b"><h3>{{ own.bookings.length }}</h3><p>Bookings</p></div></div><div class="card"><div class="b"><h3>₹{{ own.revenue | number }}</h3><p>Booked value</p></div></div><div class="card"><div class="b"><h3>{{ own.unread }}</h3><p>New alerts</p></div></div></div>
  <div class="card" style="cursor:default"><div class="b"><h2 style="font-size:24px;margin-bottom:10px">List a resort / stay</h2>
   <div class="row"><div><label>Destination</label><select [(ngModel)]="of.destinationId"><option *ngFor="let d of ownDests" [value]="d._id">{{ d.name }}</option></select></div><div><label>Name</label><input [(ngModel)]="of.name"></div><div><label>Type</label><select [(ngModel)]="of.type"><option>HOSTEL</option><option>HOMESTAY</option><option>LODGE</option><option>HOTEL</option><option>RESORT</option><option>CAMPING</option></select></div></div>
   <div class="row"><div><label>Min ₹/night</label><input type="number" [(ngModel)]="of.minPrice"></div><div><label>Max ₹/night</label><input type="number" [(ngModel)]="of.maxPrice"></div><div><label>Rooms</label><input type="number" [(ngModel)]="of.rooms"></div><div style="flex:2"><label>Photo URL (optional)</label><input [(ngModel)]="of.image"></div></div>
   <p class="err" [class.good]="ook">{{ omsg }}</p><button class="btn" (click)="addOwnStay()">List stay</button></div></div>
  <h2 style="font-size:24px;margin:26px 0 6px">Live bookings</h2>
  <table><tr><th>Ref</th><th>Guest</th><th>Stay</th><th>Check-in</th><th>Nights</th><th>Guests</th><th>Amount</th><th>Booked</th></tr><tr *ngFor="let b of own.bookings"><td>{{ b.ref }}</td><td>{{ b.userName }}<br><small>{{ b.userEmail }}</small></td><td>{{ b.stayName }}<br><small>{{ b.place }}</small></td><td>{{ b.checkIn | date:'mediumDate' }}</td><td>{{ b.nights }}</td><td>{{ b.guests }}</td><td>₹{{ b.amount | number }}</td><td>{{ b.createdAt | date:'short' }}</td></tr></table>
  <p *ngIf="!own.bookings.length" style="color:var(--mut)">No bookings yet. Keep this page open — alerts appear instantly.</p>
  <h2 style="font-size:24px;margin:26px 0 6px">Your stays</h2>
  <table><tr><th>Name</th><th>Place</th><th>Type</th><th>₹/night</th><th>Rooms</th><th>Rating</th></tr><tr *ngFor="let s of own.stays"><td>{{ s.name }}</td><td>{{ s.place }}</td><td>{{ s.kind }}</td><td>₹{{ s.minPrice | number }}–{{ s.maxPrice | number }}</td><td>{{ s.rooms }}</td><td>{{ s.avg ? '★ ' + s.avg : 'New' }}</td></tr></table>
  <h2 style="font-size:24px;margin:26px 0 6px">Notifications</h2><div class="rv" *ngFor="let n of own.notifications">🔔 {{ n.text }} <small style="color:var(--mut)">· {{ n.createdAt | date:'short' }}</small></div>
 </ng-container>
 <ng-container *ngIf="page==='plan'"><div class="eyebrow">Itinerary planner</div><h1>Plan your trip by days and budget</h1>
  <p style="color:var(--mut);max-width:680px">A rule-based, constraint-checking planner examines every combination of destinations in the region and picks the best one that fits your days and your budget, then builds a day-wise plan with an itemised cost.</p>
  <div class="search" style="margin:16px 0;max-width:760px"><h3 style="font-size:20px">Search any place in India</h3><input [(ngModel)]="q" (keyup.enter)="searchEnter()" placeholder="e.g. Jog Falls, Coorg, Goa… (press Enter)"><button class="btn" style="background:var(--gold);color:var(--gd)" (click)="searchEnter()">Search</button></div>
  <p class="err" *ngIf="searchMsg">{{ searchMsg }}</p>
  <div class="grid" *ngIf="places.length" style="margin-bottom:24px"><div class="card" *ngFor="let p of places" (click)="openExt(p)"><div class="art img" [style.background-image]="p.image ? 'url(' + p.image + ')' : null"><span class="tag">{{ p.type }}</span></div><div class="b"><h3>{{ p.name }}</h3><p>{{ p.address }}</p><span class="more">PLAN A TRIP ↗</span></div></div></div>
  <p *ngIf="places.length" style="color:var(--mut);font-size:13px;max-width:760px">Places outside Karnataka and Kerala are planned with estimated costs from your selected region's starting hub.</p>
  <div class="card" style="cursor:default;max-width:760px;margin-top:16px"><div class="b">
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px;align-items:center">
      <span style="font-size:11px;font-weight:700;color:var(--mut)">QUICK PRESETS:</span>
      <button type="button" class="chip" (click)="setPreset(2, 6000)">2 Days · ₹6,000</button>
      <button type="button" class="chip" (click)="setPreset(3, 10000)">3 Days · ₹10,000</button>
      <button type="button" class="chip" (click)="setPreset(5, 18000)">5 Days · ₹18,000</button>
      <button type="button" class="chip" (click)="setPreset(7, 25000)">7 Days · ₹25,000</button>
    </div>
    <div class="row"><div><label>Region</label><select [(ngModel)]="regionId"><option *ngFor="let r of regions" [value]="r._id">{{ r.name }}</option></select></div><div><label>Include place (optional)</label><select [(ngModel)]="planPlace"><option value="">Best fit in region</option><option *ngFor="let d of dests" [value]="d._id">{{ d.name }}</option></select></div><div><label>Days (1–15)</label><input type="number" [(ngModel)]="days" min="1" max="15"></div><div><label>Budget per person (₹)</label><input type="number" [(ngModel)]="budget" min="1" max="1000000"></div></div>
   <div class="row"><div><label>Travellers</label><input type="number" [(ngModel)]="travellers" min="1" max="20"></div><div><label>Coupon code</label><input [(ngModel)]="coupon" placeholder="optional"></div></div>
   <p class="err">{{ perr }}</p><button class="btn" [disabled]="busy" (click)="generateRegion()">{{ busy ? 'Planning…' : 'Generate day-wise itinerary →' }}</button></div></div></ng-container>
 <ng-container *ngIf="page==='map'"><div class="eyebrow">Interactive map</div><h1>All destinations</h1><p class="err" *ngIf="mapFail">The map could not be loaded.</p>
  <div id="allmap" class="map" style="height:520px"></div><div class="near"><span class="pill" *ngFor="let d of mapList">{{ d.name }}</span></div></ng-container>
 <ng-container *ngIf="page==='admin' && adm">
  <h1>Admin dashboard</h1>
  <div class="row" style="margin:14px 0"><div class="card"><div class="b"><h3>{{ adm.destinations }}</h3><p>Destinations</p></div></div><div class="card"><div class="b"><h3>{{ adm.regions }}</h3><p>Regions</p></div></div><div class="card"><div class="b"><h3>{{ adm.users }}</h3><p>Users</p></div></div><div class="card"><div class="b"><h3>{{ adm.reviews }}</h3><p>Reviews</p></div></div><div class="card"><div class="b"><h3>{{ adm.costRecords }}</h3><p>Cost records</p></div></div></div>
  <p class="err" [class.good]="aok">{{ amsg }}</p><p *ngIf="adm.missingData.length" style="color:var(--red)">Incomplete data: {{ adm.missingData.join(', ') }}</p>
  <div class="card" style="cursor:default"><div class="b"><h2 style="font-size:24px;margin-bottom:10px">{{ ef._id ? 'Edit' : 'Add' }} destination</h2>
   <div class="row"><div><label>Name</label><input [(ngModel)]="ef.name"></div><div><label>Region</label><select [(ngModel)]="ef.regionId"><option *ngFor="let r of regions" [value]="r._id">{{ r.name }}</option></select></div><div><label>Categories (comma separated)</label><input [(ngModel)]="ef.category"></div></div>
   <label>Description</label><input [(ngModel)]="ef.description" maxlength="500">
   <div class="row"><div><label>Latitude</label><input [(ngModel)]="ef.lat"></div><div><label>Longitude</label><input [(ngModel)]="ef.lon"></div><div><label>Recommended days</label><input type="number" [(ngModel)]="ef.recDays"></div></div>
   <label>Activities (comma separated)</label><input [(ngModel)]="ef.activities">
   <div class="row"><div><label>How to reach</label><input [(ngModel)]="ef.howToReach"></div><div><label>Travel hub</label><input [(ngModel)]="ef.hub"></div><div><label>Travel hours</label><input type="number" [(ngModel)]="ef.hours"></div></div>
   <div class="row"><div><label>Transport ₹ (one way)</label><input type="number" [(ngModel)]="ef.transport"></div><div><label>Stay ₹/day</label><input type="number" [(ngModel)]="ef.stay"></div><div><label>Food ₹/day</label><input type="number" [(ngModel)]="ef.food"></div><div><label>Activity ₹/day</label><input type="number" [(ngModel)]="ef.activity"></div></div>
   <div class="row"><div><label>Image URL (optional, auto-filled from Wikimedia)</label><input [(ngModel)]="ef.image"></div><div><label>Best time to visit</label><input [(ngModel)]="ef.bestTime"></div></div>
   <button class="btn" (click)="saveDest()">{{ ef._id ? 'Save changes' : 'Add destination' }}</button> <button class="btn ghost" *ngIf="ef._id" (click)="ef = blank()">Cancel edit</button></div></div>
  <h2 style="font-size:24px;margin:26px 0 6px">Destinations</h2>
  <table><tr><th>Name</th><th>Region</th><th>Category</th><th>Cost/day</th><th></th></tr>
   <tr *ngFor="let d of admDests"><td>{{ d.name }}</td><td>{{ regionName(d.region) }}</td><td>{{ d.category.join(', ') }}</td><td>₹{{ d.dailyCost }}</td><td><button class="btn ghost" (click)="editDest(d)">Edit</button> <button class="btn ghost" (click)="delDest(d)">Delete</button></td></tr></table>
  <div class="card" style="cursor:default;margin-top:20px"><div class="b"><h2 style="font-size:24px;margin-bottom:10px">Add region / state</h2>
   <div class="row"><div><label>Region or state name</label><input [(ngModel)]="rf.name"></div><div><label>Hub city</label><input [(ngModel)]="rf.hubName"></div><div><label>Hub latitude</label><input [(ngModel)]="rf.hubLat"></div><div><label>Hub longitude</label><input [(ngModel)]="rf.hubLon"></div></div>
   <label>Description</label><input [(ngModel)]="rf.description"><button class="btn" (click)="saveRegion()">Add region</button></div></div>
  <div class="card" style="cursor:default;margin-top:20px"><div class="b"><h2 style="font-size:24px;margin-bottom:10px">Add category · stay option · photo</h2>
   <div class="row"><div><label>Category name</label><input [(ngModel)]="nc"></div><div style="flex:0 0 140px"><button class="btn" (click)="addCategory()">Add category</button></div></div>
   <div class="row"><div><label>Destination</label><select [(ngModel)]="sf.destinationId"><option *ngFor="let d of admDests" [value]="d._id">{{ d.name }}</option></select></div><div><label>Stay name</label><input [(ngModel)]="sf.name"></div><div><label>Type</label><select [(ngModel)]="sf.type"><option>HOSTEL</option><option>HOMESTAY</option><option>LODGE</option><option>HOTEL</option><option>RESORT</option><option>CAMPING</option></select></div><div><label>Min ₹/night</label><input type="number" [(ngModel)]="sf.minPrice"></div><div><label>Max ₹/night</label><input type="number" [(ngModel)]="sf.maxPrice"></div></div><button class="btn" (click)="addStay()">Add stay</button>
   <div class="row" style="margin-top:14px"><div><label>Destination</label><select [(ngModel)]="pf.destinationId"><option *ngFor="let d of admDests" [value]="d._id">{{ d.name }}</option></select></div><div style="flex:3"><label>Photo URL (http/https)</label><input [(ngModel)]="pf.url"></div><div><label>Caption</label><input [(ngModel)]="pf.caption" maxlength="200"></div></div><button class="btn" (click)="addPhoto()">Add photo</button></div></div>
  <h2 style="font-size:24px;margin:26px 0 6px">Registered users ({{ adm.userList.length }})</h2>
  <table><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr><tr *ngFor="let u of adm.userList"><td>{{ u.name }}</td><td>{{ u.email }}</td><td>{{ u.role }}</td><td>{{ u.createdAt | date:'medium' }}</td></tr></table>
  <h2 style="font-size:24px;margin:26px 0 6px">Coupons</h2>
  <div class="card" style="cursor:default"><div class="b"><div class="row"><div><label>Code</label><input [(ngModel)]="cf.code" maxlength="15"></div><div><label>Discount %</label><input type="number" [(ngModel)]="cf.percent"></div><div><label>Max discount ₹</label><input type="number" [(ngModel)]="cf.maxDiscount"></div><div><label>Valid for (days)</label><input type="number" [(ngModel)]="cf.validDays"></div></div><button class="btn" (click)="addCoupon()">Create coupon</button></div></div>
  <table><tr><th>Code</th><th>Off</th><th>Max ₹</th><th>Expires</th><th>Used</th><th></th></tr><tr *ngFor="let c of adm.coupons"><td>{{ c.code }}</td><td>{{ c.percent }}%</td><td>₹{{ c.maxDiscount }}</td><td>{{ c.validTill | date:'mediumDate' }}</td><td>{{ c.uses }}</td><td><button class="btn ghost" (click)="delCoupon(c)">Delete</button></td></tr></table>
  <h2 style="font-size:24px;margin:26px 0 6px">Activity log</h2>
  <table><tr><th>Time</th><th>Who</th><th>Action</th><th>Detail</th></tr><tr *ngFor="let a of adm.audit"><td>{{ a.createdAt | date:'short' }}</td><td>{{ a.who }}</td><td>{{ a.action }}</td><td>{{ a.detail }}</td></tr></table>
  <h2 style="font-size:24px;margin:26px 0 6px">Review moderation</h2>
  <table><tr><th>Place</th><th>Rating</th><th>Comment</th><th></th></tr><tr *ngFor="let r of adm.latestReviews"><td>{{ r.destination?.name }}</td><td>★ {{ r.rating }}</td><td style="text-align:left">{{ r.text }}</td><td><button class="btn ghost" (click)="delReview(r)">Delete</button></td></tr></table>
  <p *ngIf="!adm.latestReviews.length" style="color:var(--mut)">No reviews yet.</p>
 </ng-container>
</main>

<!-- ============ DESTINATION + PLANNER PROMPT ============ -->
<div class="modal" *ngIf="sel" (click)="closeAll()"><div class="sheet" (click)="$event.stopPropagation()">
  <div class="hero-img" *ngIf="sel.image" [style.background-image]="'url(' + sel.image + ')'"></div>
  <h2 style="font-size:32px">{{ sel.name }}</h2>
  <button class="btn mapbtn" (click)="toggleMap()">{{ showMap ? '✕ Hide map' : '🗺 Show map' }}</button>
  <div id="map" class="map" *ngIf="showMap"></div>
  <span class="pill" *ngFor="let c of (dcats.length ? dcats : sel.category)">{{ c }}</span><span class="pill">Ideal: {{ sel.recDays }} day(s)</span><span class="pill" *ngIf="!sel.ext">{{ sel.tier }}</span><span class="pill" *ngIf="rev?.average">★ {{ rev.average }} ({{ rev.count }})</span>
  <p>{{ sel.description }}</p>
  <div class="sumbar"><div><small>WEATHER NOW</small><b>{{ wnow != null ? wnow + '°C' : '—' }}</b><span *ngIf="weather.length">Today {{ weather[0].min }}–{{ weather[0].max }}°C · rain {{ weather[0].rain }}%</span></div>
   <div><small>BEST TIME TO VISIT</small><b>{{ sel.bestTime || 'Not available' }}</b><span *ngIf="sel.bestTime" [class.yes]="inSeason(sel.bestTime)">{{ inSeason(sel.bestTime) ? '✓ Good season right now' : 'Off-season right now' }}</span><span *ngIf="sel.btEst">Estimated from last year weather</span></div>
   <div><small>NEARBY PLACES</small><b>{{ nearTop() }}</b><span>{{ sel.nearby?.length || 0 }} places within reach</span></div></div>
  <div class="gal" *ngIf="photos.length"><img *ngFor="let p of photos" [src]="p.url" [alt]="p.caption || sel.name" loading="lazy" (error)="$event.target.style.display='none'"></div>
  <div class="facts" *ngIf="!sel.ext"><div><b>Travel info</b><br>{{ ti?.howToReach || 'Information not available' }}<br><span *ngIf="ti?.hub">From {{ ti.hub }} · {{ ti.hours }} h</span></div>
   <div><b>Costs (estimate)</b><br><ng-container *ngIf="costs?.transport != null">Transport ₹{{ costs.transport | number }} · Stay ₹{{ costs.stay | number }}/day<br>Food ₹{{ costs.food | number }}/day · Activity ₹{{ costs.activity | number }}/day</ng-container><ng-container *ngIf="costs?.transport == null">Information not available</ng-container></div>
   <div><b>Activities</b><br>{{ sel.activities?.length ? sel.activities.join(', ') : 'Information not available' }}</div></div>
  
  <div class="near" *ngIf="weather.length"><span class="pill" *ngFor="let w of weather">{{ w.date.slice(5) }}: {{ w.min }}–{{ w.max }}°C · rain {{ w.rain }}%</span></div>
  <ng-container *ngIf="sel.stays?.length"><h3>Resorts &amp; stays</h3><div class="chips" style="margin:6px 0"><button class="chip" [class.on]="staySort==='rating'" (click)="staySort='rating'">🏆 Highest rated</button><button class="chip" [class.on]="staySort==='price'" (click)="staySort='price'">💰 Budget friendly</button></div>
   <div class="stay" *ngFor="let s of sortedStays()"><div><b>{{ s.name }}</b> <span class="pill">{{ s.kind }}</span><span class="pill" *ngIf="isBest(s)">🏆 Highest rated</span><span class="pill" *ngIf="isCheap(s)">💰 Budget friendly</span><br>₹{{ s.price | number }}/night · <span style="color:var(--gold)">★ {{ s.avg }}</span> ({{ s.count }})</div>
    <div>Rate: <button class="chip" *ngFor="let n of [1,2,3,4,5]" (click)="rateStay(s, n)">{{ n }}</button></div></div></ng-container>
  <ng-container *ngIf="!sel.ext"><h3 style="margin-top:14px">Reviews <span *ngIf="rev?.average" style="font-size:14px;color:var(--mut)">★ {{ rev.average }} ({{ rev.count }})</span></h3>
   <div class="row"><div style="flex:0 0 110px"><select [(ngModel)]="revForm.rating"><option *ngFor="let n of [5,4,3,2,1]" [ngValue]="n">{{ n }} ★</option></select></div>
    <div style="flex:3"><input [(ngModel)]="revForm.text" maxlength="500" placeholder="Share your experience (max 500 characters)"></div>
    <div style="flex:0 0 130px"><button class="btn" style="margin-top:4px" (click)="postReview()">Post review</button></div></div>
   <p class="err" [class.good]="rok">{{ rmsg }}</p><div class="rv" *ngFor="let r of rev?.reviews"><b>{{ r.userName || 'Traveller' }}</b> · ★ {{ r.rating }}<br>{{ r.text }}</div></ng-container>
  <h3>Nearby</h3><div class="chips" style="margin:6px 0"><button class="chip" *ngFor="let k of kinds" [class.on]="nk===k.id" (click)="loadNear(k.id)">{{ k.label }}</button></div>
  <div class="near" *ngIf="nk==='attractions'"><button *ngFor="let n of sel.nearby" (click)="openNear(n)">{{ n.name }} · {{ n.distanceKm }} km</button>
   <span *ngIf="!sel.nearby.length" style="color:var(--mut)">{{ nearMsg || 'Loading nearby attractions…' }}</span><button class="chip" *ngIf="!sel.nearby.length && nearMsg" (click)="fetchAttractions()">Retry</button></div>
  <div class="near" *ngIf="nk!=='attractions'"><span class="pill" *ngFor="let n of nearList">{{ n.name }} · {{ n.distanceKm }} km<span *ngIf="n.rating"> · ★ {{ n.rating }} ({{ n.reviews }})</span><span *ngIf="!n.rating && n.stars"> · {{ n.stars }}★ hotel</span></span><span *ngIf="!nearList.length" style="color:var(--mut)">{{ nearMsg }}</span></div>
  <h3 style="margin-top:14px">Plan a budget itinerary{{ ask ? ' — enter your budget' : '' }}</h3>
  <p style="color:var(--mut);margin:2px 0 8px">Enter days and budget; we build a day-wise plan including {{ sel.name }} and the best nearby stops.</p>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 10px;align-items:center">
    <span style="font-size:11px;font-weight:700;color:var(--mut)">QUICK PRESETS:</span>
    <button type="button" class="chip" (click)="setPreset(2, 6000)">2 Days · ₹6,000</button>
    <button type="button" class="chip" (click)="setPreset(3, 10000)">3 Days · ₹10,000</button>
    <button type="button" class="chip" (click)="setPreset(5, 18000)">5 Days · ₹18,000</button>
    <button type="button" class="chip" (click)="setPreset(7, 25000)">7 Days · ₹25,000</button>
  </div>
  <div class="row"><div><label>Days (1–15)</label><input type="number" [(ngModel)]="days" min="1" max="15"></div><div><label>Budget per person (₹)</label><input type="number" [(ngModel)]="budget" min="1" max="1000000"></div><div><label>Travellers</label><input type="number" [(ngModel)]="travellers" min="1" max="20"></div><div><label>Coupon code</label><input [(ngModel)]="coupon" placeholder="optional"></div></div>
  <p class="err">{{ perr }}</p><button class="btn" [disabled]="busy" (click)="generate()">{{ busy ? 'Planning…' : 'Generate itinerary →' }}</button> <button class="btn ghost" (click)="closeAll()">Close</button>
</div></div>

<!-- ============ ITINERARY RESULT ============ -->
<div class="modal" *ngIf="res" (click)="closeAll()"><div class="sheet" (click)="$event.stopPropagation()">
  <h2 style="font-size:30px">Your itinerary</h2><p><span class="pill" *ngFor="let s of res.stops">{{ s.name }} <a *ngIf="lastReq && !isAnchor(s)" (click)="removeStop(s)" style="cursor:pointer;color:var(--red)" title="Remove this stop">×</a></span></p>
  <span class="status" [ngClass]="res.status">{{ res.status }}</span> <b>Payable ₹{{ (res.payable ?? res.costs.total) | number }}</b> of ₹{{ res.budget | number }} ·
  {{ res.status==='EXCEEDS' ? 'Shortfall ₹' + (res.shortfall | number) : 'Remaining ₹' + (res.remaining | number) }} · {{ res.daysUsed }}/{{ res.days }} days used
  <div *ngIf="res.status==='EXCEEDS'" class="notice">
    <b>Over budget.</b> The cheapest valid {{ res.days }}-day plan we can build costs ₹{{ (res.payable ?? res.costs.total) | number }} per person, ₹{{ res.shortfall | number }} more than your budget.
    <span *ngIf="res.alternatives?.length"> Shorter trips that fit your budget: <b *ngFor="let a of res.alternatives; let last = last">{{ a.days }} day(s) (₹{{ a.total | number }}, {{ a.stops.join(' + ') }}){{ last ? '' : '; ' }}</b>.</span>
    <span *ngIf="!res.alternatives?.length"> No shorter trip fits this budget either, so please raise your budget.</span>
  </div>
  <h3 style="margin-top:12px">🗺 Route map</h3><div id="rmap" class="map" style="height:340px"></div>
  <div class="checks"><span [class.bad]="!okDays()">{{ okDays() ? '✓' : '✗' }} Days: {{ res.daysUsed }} of {{ res.days }} used</span><span [class.bad]="!okBudget()">{{ okBudget() ? '✓' : '✗' }} Budget: ₹{{ (res.payable ?? res.costs.total) | number }} vs ₹{{ res.budget | number }}</span><span>{{ res.days_plan.length === res.days ? '✓' : '✗' }} {{ res.days_plan.length }} of {{ res.days }} requested days planned</span><span>✓ Route starts and ends at {{ res.hub?.name || 'the hub' }}</span></div>
  <div class="day" *ngFor="let p of res.days_plan">
    <div class="dn">Day {{ p.day }}</div>
    <div class="dbody">
      <b>{{ p.place }}</b>
      <span class="pill" *ngIf="bt(p.place)">🗓 Best: {{ bt(p.place) }}</span>
      <span class="pill" *ngIf="p.travelTime">⏱ {{ p.travelTime }}</span>
      <span class="pill" *ngIf="p.dailyTotal" style="font-weight:700">₹{{ p.dailyTotal | number }}/day</span>
      <br>
      <div *ngIf="p.schedule" style="margin:6px 0;font-size:13px;line-height:1.5;background:var(--soft);padding:8px 12px;border-radius:10px">
        <div><b>Morning:</b> {{ p.schedule.morning }}</div>
        <div><b>Afternoon:</b> {{ p.schedule.afternoon }}</div>
        <div><b>Evening:</b> {{ p.schedule.evening }}</div>
      </div>
      <span *ngIf="!p.schedule" style="color:var(--mut)">{{ p.activities.length ? p.activities.join(' · ') : 'Sightseeing' }}</span>
      <div><span class="pill">🚌 ₹{{ p.transport | number }}</span><span class="pill">🛏 ₹{{ p.stay | number }}</span><span class="pill">🍽 ₹{{ p.food | number }}</span><span class="pill">🎟 ₹{{ p.activity | number }}</span></div>
    </div>
  </div>
  <div class="tot"><span class="pill">Transport ₹{{ res.costs.transport | number }}</span><span class="pill">Stay ₹{{ res.costs.stay | number }}</span><span class="pill">Food ₹{{ res.costs.food | number }}</span><span class="pill">Activity ₹{{ res.costs.activity | number }}</span><span class="pill"><b>Total ₹{{ res.costs.total | number }}</b></span></div>
  <div class="calc"><div *ngFor="let l of res.calculation">{{ l }}</div><div *ngIf="res.coupon">Coupon {{ res.coupon.code }} ({{ res.coupon.percent }}%) = −₹{{ res.coupon.discount | number }}</div><div>Per person ₹{{ (res.payable ?? res.costs.total) | number }} × {{ res.travellers || 1 }} traveller(s) = ₹{{ (res.payable ?? res.costs.total) * (res.travellers || 1) | number }}</div></div><p class="err">{{ rerr }}</p><p style="font-size:12px;color:var(--mut)">Costs are estimates, not live prices.</p>
  <button class="btn" (click)="closeAll()">Done</button> <button class="btn ghost" (click)="print()">Download PDF</button> <button class="btn" *ngIf="res.itineraryId && role === 'traveller'" (click)="openBooking()">🏨 Book stays</button>
  <div class="card" *ngIf="bk" style="cursor:default;margin-top:14px"><div class="b"><h3>Book your stays</h3>
   <div class="row"><div><label>Check-in date</label><input type="date" [(ngModel)]="bk.checkIn" [min]="today"></div><div><label>Guests</label><input type="number" [(ngModel)]="bk.guests" min="1" max="20"></div></div>
   <div class="stay" *ngFor="let st of res.stops"><div><b>{{ st.name }}</b></div><div *ngIf="bk.options[st.id]?.length"><select [(ngModel)]="bk.picks[st.id]"><option *ngFor="let o of bk.options[st.id]" [value]="o.id">{{ o.name }} · ₹{{ o.price | number }}/night · ★ {{ o.avg ?? 'new' }}</option></select></div><div *ngIf="!bk.options[st.id]?.length" style="color:var(--mut)">No bookable stays listed yet</div></div>
   <p class="err" [class.good]="bk.ok">{{ bk.msg }}</p><button class="btn" [disabled]="bk.done" (click)="confirmBooking()">Confirm booking</button></div></div>
</div></div>
</ng-container>`
})
export class AppComponent implements OnInit {
  token = localStorage.getItem('osmw_token'); name = localStorage.getItem('osmw_name') || '';
  reg = false; ok = false; msg = ''; f = { name: '', email: '', password: '', role: 'traveller' };
  rules = [
    { label: '8+ characters', test: (p: string) => p.length >= 8 }, { label: 'Uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
    { label: 'Lowercase letter', test: (p: string) => /[a-z]/.test(p) }, { label: 'A digit', test: (p: string) => /\d/.test(p) },
    { label: 'Special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) }, { label: 'No spaces', test: (p: string) => !!p && !/\s/.test(p) }];
  page = 'explore'; q = ''; tier = ''; cat = ''; cats: string[] = []; dests: any[] = []; trips: any[] = []; totalCount = 0; loading = true; loadErr = ''; busy = false; authBusy = false; loadSeq = 0;
  role = localStorage.getItem('osmw_role') || ''; regions: any[] = []; regionId = ''; adm: any = null; admDests: any[] = []; ef: any = null; aok = false; amsg = '';
  rf = { name: '', hubName: '', hubLat: '', hubLon: '', description: '' };
  favs: string[] = []; onlyFav = false; dark = localStorage.getItem('osmw_dark') === '1'; topStays: any[] = []; offers: any[] = []; weather: any[] = [];
  travellers = 1; coupon = ''; lastReq: any = null; rerr = ''; rok = false; rmsg = ''; revForm = { rating: 5, text: '' };
  recent: any[] = JSON.parse(localStorage.getItem('osmw_recent') || '[]'); cf = { code: '', percent: 10, maxDiscount: 1000, validDays: 30 };
  planPlace = ''; adminLogin = false; regionInfo: any = null; ti: any = null; costs: any = null; photos: any[] = []; dcats: string[] = []; nc = '';
  sf = { destinationId: '', name: '', type: 'RESORT', minPrice: 1000, maxPrice: 2000 }; pf = { destinationId: '', url: '', caption: '' };
  kinds = [{ id: 'attractions', label: 'Attractions' }, { id: 'food', label: 'Food' }, { id: 'stay', label: 'Stays' }, { id: 'essentials', label: 'Essentials' }];
  staySort = 'rating'; budgetStays: any[] = []; wnow: number | null = null; bk: any = null; today = new Date().toISOString().slice(0, 10); myBookings: any[] = [];
  own: any = null; ownDests: any[] = []; of = { destinationId: '', name: '', type: 'RESORT', minPrice: 1500, maxPrice: 3000, rooms: 10, image: '' }; omsg = ''; ook = false; toast = ''; es: EventSource | null = null;
  showMap = false; nk = 'attractions'; nearList: any[] = []; nearMsg = ''; nearLayer: L.LayerGroup | null = null; pmap: L.Map | null = null; mapList: any[] = []; mapFail = false;
  places: any[] = []; searchMsg = ''; sel: any = null; rev: any = null; ask = false; days = 3; budget = 12000; perr = ''; res: any = null; maps: L.Map[] = [];
  constructor(private http: HttpClient, private zone: NgZone) {}
  ngOnInit() { document.body.classList.toggle('dark', this.dark); if (this.token) { this.init(); if (this.role === 'owner') this.openOwner(); } }
  init() {
    this.http.get<string[]>('/api/categories').subscribe({ next: c => this.cats = c, error: () => this.logout() });
    this.http.get<any[]>('/api/regions').subscribe(r => { this.regions = r; this.regionId = this.regionId || r[0]?._id || ''; this.load(); this.loadExtras(); this.loadRegion(); });
  }
  hub() { return this.regions.find(r => r._id === this.regionId)?.hub || { lat: 15, lon: 76 }; }
  regionChanged() { this.q = ''; this.cat = ''; this.tier = ''; this.onlyFav = false; this.places = []; this.searchMsg = ''; this.load(); this.loadExtras(); this.loadRegion(); }
  regionName(id: string) { return this.regions.find(r => r._id === id)?.name || ''; }

  setReg(r: boolean) { this.reg = r; this.msg = ''; }
  submit() {
    this.ok = false; this.msg = '';
    if (this.reg) {
      if (!this.f.name.trim()) return void (this.msg = 'Please enter your name.');
      const bad = this.rules.filter(r => !r.test(this.f.password));
      if (bad.length) return void (this.msg = 'Password needs: ' + bad.map(b => b.label.toLowerCase()).join(', ') + '.');
    }
    this.authBusy = true;
    this.http.post<any>(this.reg ? '/api/auth/register' : '/api/auth/login', this.f).subscribe({
      next: d => { this.authBusy = false;
        if (this.reg) { this.setReg(false); this.f.password = ''; this.ok = true; this.msg = d.message; }
        else { this.token = d.token; this.name = d.name; localStorage.setItem('osmw_token', d.token); localStorage.setItem('osmw_name', d.name); this.role = d.role; localStorage.setItem('osmw_role', d.role); this.init(); if (d.role === 'owner') this.openOwner(); }
      }, error: e => { this.authBusy = false; this.msg = e.error?.error || 'Could not reach the server.'; } });
  }
  logout() { this.token = null; localStorage.removeItem('osmw_token'); localStorage.removeItem('osmw_role'); this.role = ''; this.page = 'explore'; this.es?.close(); this.es = null; this.own = null; this.closeAll(); }

  load() {
    if (!this.q) { this.places = []; this.searchMsg = ''; }
    const p: any = {};
    if (this.q) p.q = this.q;
    if (this.cat) p.category = this.cat;
    if (this.tier) p.tier = this.tier;
    if (this.regionId) p.region = this.regionId;
    const seq = ++this.loadSeq; this.loading = true; this.loadErr = '';
    this.http.get<any[]>(this.q || this.cat || this.tier ? '/api/destinations/search' : '/api/destinations', { params: p })
      .subscribe({
        next: d => {
          if (seq !== this.loadSeq) return;   // ignore out-of-order responses from earlier keystrokes
          this.loading = false;
          this.dests = this.onlyFav ? d.filter(x => this.favs.includes(x._id)) : d;
          if (!this.q && !this.cat && !this.tier && !this.onlyFav) this.totalCount = d.length;
        },
        error: e => { if (seq !== this.loadSeq) return; this.loading = false; this.loadErr = e.error?.error || 'Could not load destinations. Is the backend running?'; } });
  }
  setPreset(d: number, b: number) { this.days = d; this.budget = b; }
  clearFilters() {
    this.q = ''; this.cat = ''; this.tier = ''; this.onlyFav = false; this.places = []; this.searchMsg = ''; this.load();
  }
  setCat(c: string) { this.cat = c; this.load(); }
  searchEnter() {   // search any place in Karnataka via the places API and list the results
    if (this.q.trim().length < 2) { this.searchMsg = 'Type at least 2 letters.'; return; }
    this.searchMsg = 'Searching…';
    this.http.get<any[]>('/api/places/search', { params: { q: this.q, lat: this.hub().lat, lon: this.hub().lon } }).subscribe({
      next: p => { this.places = p; this.searchMsg = (p.length || this.dests.length) ? '' : 'No map results found. Try another spelling.';
        p.forEach(x => this.http.get<any>('/api/image', { params: { name: x.name, hint: (x.address || '').split(',').pop()?.trim() || '' } }).subscribe(r => { if (r.url) x.image = r.url; })); },
      error: e => { this.places = []; this.searchMsg = this.dests.length ? '' : (e.error?.error || 'Search failed. Is the backend running?'); } });
  }
  openDest(id: string, ask = false) {
    this.ask = ask; this.perr = ''; this.res = null;
    this.http.get<any>('/api/destination/' + id).subscribe(d => {
      this.http.get<any>(`/api/destination/${id}/reviews`).subscribe(r => this.rev = r); this.pushRecent(d); this.loadInfo(d.id); this.showSel(d); });
  }
  openExt(p: any, ask = true) {
    this.ask = ask; this.perr = ''; this.res = null; this.rev = null; this.ti = null; this.costs = null; this.photos = []; this.dcats = [];
    this.showSel({ ext: true, name: p.name, lat: p.lat, lon: p.lon, category: [p.type || 'place'], recDays: 2, tier: 'ESTIMATED',
      activities: ['Sightseeing'], description: p.address || '', nearby: [], image: p.image });
  }
  openNear(n: any) { n.id ? this.openDest(n.id) : this.openExt(n); }
  showSel(d: any) {   // shows the place, merges nearby places from the places API, draws the map
    this.sel = d; this.weather = []; this.wnow = null; this.rmsg = ''; this.nk = 'attractions'; this.nearList = []; this.nearMsg = ''; this.showMap = false; this.maps.forEach(m => { try { m.remove(); } catch {} }); this.maps = [];
    this.http.get<any>(`/api/weather?lat=${d.lat}&lon=${d.lon}`).subscribe({ next: w => { this.weather = w.daily; this.wnow = w.now; }, error: () => {} });
    if (!d.bestTime) this.http.get<any>('/api/besttime', { params: { lat: d.lat, lon: d.lon } }).subscribe({ next: r => { if (r.range) { d.bestTime = r.range; d.btEst = true; } }, error: () => {} });
    if (d.ext && !d.image) this.http.get<any>('/api/image', { params: { name: d.name, hint: (d.description || '').split(',').pop()?.trim() || '' } }).subscribe(r => { if (r.url) d.image = r.url; });
    const draw = () => { if (this.showMap && this.sel === d) setTimeout(() => this.buildMap(), 50); };
    const go = () => this.http.get<any[]>(`/api/places/nearby?lat=${d.lat}&lon=${d.lon}`).subscribe({
      next: n => { const have = new Set(d.nearby.map((x: any) => x.name));
        d.nearby = [...d.nearby, ...n.filter(x => x.name !== d.name && !have.has(x.name))].sort((a: any, b: any) => a.distanceKm - b.distanceKm).slice(0, 10); this.nearMsg = d.nearby.length ? '' : 'No attractions found nearby.'; draw(); },
      error: e => { this.nearMsg = e.error?.error || 'Nearby places could not be loaded.'; draw(); } });
    if (d.ext) go(); else this.http.get<any>(`/api/destination/${d.id}/location`).subscribe({ next: l => { d.lat = l.latitude; d.lon = l.longitude; go(); }, error: () => go() });
  }
  generate() {
    this.perr = '';
    this.run({ ...(this.sel.ext ? { place: { name: this.sel.name, lat: this.sel.lat, lon: this.sel.lon } } : { destinationId: this.sel.id }), regionId: this.regionId,
      travellers: +this.travellers, coupon: this.coupon, days: +this.days, budget: +this.budget, exclude: [] });
  }
  run(body: any) {
    this.busy = true;
    this.http.post<any>('/api/itinerary/generate', body).subscribe({ next: r => { this.busy = false; this.lastReq = body; this.rerr = ''; this.showResult(r); },
      error: e => { this.busy = false; this.perr = this.rerr = e.error?.error || 'Could not generate itinerary.'; } });
  }
  removeStop(s: any) { this.run({ ...this.lastReq, exclude: [...this.lastReq.exclude, s.id] }); }   // edit itinerary: drop a stop and recalculate
  isAnchor(s: any) { return s.id === 'ext' || s.id === this.lastReq?.destinationId; }
  print() { window.print(); }
  showResult(r: any) {
    this.closeAll(); this.res = r; this.bk = null;
    setTimeout(() => {
      const pts: [number, number][] = [[r.hub.lat, r.hub.lon], ...r.stops.map((s: any) => [s.lat, s.lon] as [number, number]), [r.hub.lat, r.hub.lon]];
      const m = this.newMap('rmap', pts[0], 7);
      L.polyline(pts, { color: '#e3a84a', weight: 4, dashArray: '8 8' }).addTo(m);
      L.circleMarker(pts[0], { radius: 6, color: '#143d2e' }).addTo(m).bindTooltip(r.hub.name + ' (start)');
      r.stops.forEach((s: any, i: number) => L.circleMarker([s.lat, s.lon], { radius: 9, color: '#1f5c46', fillOpacity: .9 }).addTo(m).bindTooltip(`${i + 1}. ${s.name}`, { permanent: true }));
      m.fitBounds(pts, { padding: [30, 30] }); setTimeout(() => { m.invalidateSize(); m.fitBounds(pts, { padding: [30, 30] }); }, 300);
    }, 50);
  }
  loadRegion() { if (this.regionId) this.http.get<any>(`/api/region/${this.regionId}`).subscribe(r => this.regionInfo = r); }
  loadInfo(id: string) {
    this.ti = null; this.costs = null; this.photos = []; this.dcats = [];
    this.http.get<any>(`/api/destination/${id}/travelinfo`).subscribe(t => this.ti = t);
    this.http.get<any>(`/api/destination/${id}/costs`).subscribe(c => this.costs = c);
    this.http.get<any[]>(`/api/destination/${id}/photos`).subscribe(p => this.photos = p);
    this.http.get<string[]>(`/api/destination/${id}/categories`).subscribe(c => this.dcats = c);
  }
  toggleMap() {
    this.showMap = !this.showMap;
    if (this.showMap) setTimeout(() => this.buildMap(), 50);
    else { this.maps.forEach(m => { try { m.remove(); } catch {} }); this.maps = []; this.nearLayer = null; }
  }
  buildMap() {
    const d = this.sel; if (!d || !this.showMap || !document.getElementById('map')) return;
    this.maps.forEach(m => { try { m.remove(); } catch {} }); this.maps = [];
    const m = this.newMap('map', [d.lat, d.lon], 9);
    L.circleMarker([d.lat, d.lon], { radius: 10, color: '#143d2e', fillColor: '#e3a84a', fillOpacity: 1 }).addTo(m).bindTooltip(d.name, { permanent: true });
    this.nearLayer = L.layerGroup().addTo(m); this.drawNear(this.nk === 'attractions' ? d.nearby : this.nearList);
  }
  sortedStays() { return [...(this.sel?.stays || [])].sort(this.staySort === 'price' ? (a: any, b: any) => a.price - b.price : (a: any, b: any) => (b.avg || 0) - (a.avg || 0)); }
  isBest(s: any) { const l = this.sel.stays.filter((x: any) => x.avg); return !!s.avg && s.avg === Math.max(...l.map((x: any) => x.avg)); }
  isCheap(s: any) { return s.price === Math.min(...this.sel.stays.map((x: any) => x.price)); }
  nearTop() { return (this.sel?.nearby || []).slice(0, 3).map((n: any) => n.name).join(' · ') || this.nearMsg || 'Loading…'; }
  openBooking() {
    this.bk = { checkIn: this.today, guests: this.res.travellers || 1, options: {}, picks: {}, msg: '', ok: false, done: false };
    this.res.stops.filter((s: any) => s.id !== 'ext').forEach((s: any) => this.http.get<any[]>(`/api/destination/${s.id}/stays`).subscribe(l => { this.bk.options[s.id] = l; if (l.length) this.bk.picks[s.id] = l[0].id; }));
  }
  confirmBooking() {
    const b = this.bk;
    this.http.post<any>('/api/bookings', { itineraryId: this.res.itineraryId, checkIn: b.checkIn, guests: +b.guests, picks: b.picks }).subscribe({
      next: r => { b.ok = true; b.done = true; b.msg = `Booked! ${r.bookings.length} stay(s) confirmed. Ref: ${r.bookings.map((x: any) => x.ref).join(', ')}. The resort owners have been notified instantly.`; },
      error: e => { b.ok = false; b.msg = e.error?.error || 'Booking failed.'; } });
  }
  openOwner() {
    this.page = 'owner';
    this.http.get<any>('/api/owner/dashboard').subscribe(d => this.own = d);
    this.http.get<any[]>('/api/destinations').subscribe(d => this.ownDests = d);
    this.connectStream();
  }
  connectStream() {   // live booking alerts (Server-Sent Events)
    if (this.es || !this.token) return;
    const es = this.es = new EventSource('/api/owner/stream?token=' + encodeURIComponent(this.token));
    es.onmessage = ev => this.zone.run(() => { const n = JSON.parse(ev.data); this.toast = '🔔 New booking: ' + n.text; setTimeout(() => this.toast = '', 10000); if (this.page === 'owner') this.openOwner(); });
  }
  addOwnStay() {
    this.omsg = ''; this.ook = false;
    this.http.post('/api/owner/stays', this.of).subscribe({ next: () => { this.ook = true; this.omsg = 'Stay listed. Travellers can now book it.'; this.of.name = ''; this.openOwner(); }, error: e => this.omsg = e.error?.error || 'Could not list the stay.' });
  }
  fetchAttractions() {   // retry button
    const d = this.sel; if (!d) return; this.nearMsg = 'Searching…';
    this.http.get<any[]>('/api/places/nearby', { params: { lat: d.lat, lon: d.lon, kind: 'attractions' } }).subscribe({
      next: n => { const have = new Set(d.nearby.map((x: any) => x.name)); d.nearby = [...d.nearby, ...n.filter(x => x.name !== d.name && !have.has(x.name))].sort((a: any, b: any) => a.distanceKm - b.distanceKm).slice(0, 10);
        this.nearMsg = d.nearby.length ? '' : 'No attractions found nearby.'; if (this.nk === 'attractions') { this.nearLayer?.clearLayers(); this.drawNear(d.nearby); } },
      error: e => this.nearMsg = e.error?.error || 'Nearby places could not be loaded.' });
  }
  loadNear(k: string) {
    this.nk = k; this.nearList = []; this.nearLayer?.clearLayers();
    if (k === 'attractions') return this.drawNear(this.sel.nearby);
    this.nearMsg = 'Searching…';
    this.http.get<any[]>('/api/places/nearby', { params: { lat: this.sel.lat, lon: this.sel.lon, kind: k } }).subscribe({
      next: n => { this.nearList = n; this.nearMsg = n.length ? '' : 'Nothing found within 25 km.'; this.drawNear(n); }, error: e => this.nearMsg = e.error?.error || 'Could not load nearby places.' });
  }
  drawNear(list: any[]) { list.forEach(n => this.nearLayer && L.circleMarker([n.lat, n.lon], { radius: 6, color: '#1f5c46' }).addTo(this.nearLayer).bindTooltip(`${n.name} · ${n.distanceKm} km`)); }
  inSeason(bt: string) {   // is the current month inside e.g. "Oct–Feb"?
    const M = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], m = (bt || '').toLowerCase().match(/([a-z]{3})\w*\s*[–-]\s*([a-z]{3})/);
    if (/all year/i.test(bt)) return true; if (!m) return (bt || '').toLowerCase().includes(M[new Date().getMonth()]); const a = M.indexOf(m[1]), b = M.indexOf(m[2]), n = new Date().getMonth(); return a <= b ? n >= a && n <= b : n >= a || n <= b;
  }
  bt(n: string) { return this.res?.stops?.find((s: any) => s.name === n)?.bestTime; }
  okDays() { return this.res.daysUsed <= this.res.days; }
  okBudget() { return (this.res.payable ?? this.res.costs.total) <= this.res.budget; }
  generateRegion() { this.perr = ''; this.run({ destinationId: this.planPlace || undefined, regionId: this.regionId, travellers: +this.travellers, coupon: this.coupon, days: +this.days, budget: +this.budget, exclude: [] }); }
  openMap() {
    this.page = 'map'; this.mapFail = false;
    this.http.get<any[]>('/api/destinations/map', { params: { region: this.regionId } }).subscribe({ next: list => { this.mapList = list; setTimeout(() => {
      try { this.pmap?.remove(); } catch {}
      const m = this.pmap = L.map('allmap'); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(m);
      list.forEach(d => { const el = document.createElement('div'), b = document.createElement('b'), a = document.createElement('a'); b.textContent = d.name; a.textContent = ' View details →'; a.style.cursor = 'pointer'; a.onclick = () => this.openDest(d.id);
        el.append(b, document.createElement('br'), a); L.circleMarker([d.latitude, d.longitude], { radius: 9, color: '#143d2e', fillColor: '#e3a84a', fillOpacity: 1 }).addTo(m).bindPopup(el); });
      if (list.length) m.fitBounds(list.map(d => [d.latitude, d.longitude] as [number, number]), { padding: [40, 40] });
    }, 50); }, error: () => this.mapFail = true });
  }
  loadExtras() {
    this.http.get<string[]>('/api/favorites').subscribe(f => this.favs = f);
    this.http.get<any[]>('/api/stays/top', { params: this.regionId ? { region: this.regionId } : {} }).subscribe(s => this.topStays = s);
    this.http.get<any[]>('/api/stays/top', { params: { ...(this.regionId ? { region: this.regionId } : {}), sort: 'price' } }).subscribe(s => this.budgetStays = s);
    this.http.get<any[]>('/api/coupons').subscribe(c => this.offers = c);
  }
  toggleFav(d: any, e: Event) { e.stopPropagation(); this.http.post<string[]>('/api/favorites/' + d._id, {}).subscribe(f => { this.favs = f; if (this.onlyFav) this.load(); }); }
  toggleDark() { this.dark = !this.dark; localStorage.setItem('osmw_dark', this.dark ? '1' : '0'); document.body.classList.toggle('dark', this.dark); }
  pushRecent(d: any) { this.recent = [{ id: d._id, name: d.name }, ...this.recent.filter(r => r.id !== d._id)].slice(0, 5); localStorage.setItem('osmw_recent', JSON.stringify(this.recent)); }
  postReview() {
    this.rmsg = ''; this.rok = false;
    this.http.post('/api/reviews', { destinationId: this.sel.id, ...this.revForm }).subscribe({
      next: () => { this.rok = true; this.rmsg = 'Thanks! Review posted.'; this.revForm.text = ''; this.http.get<any>(`/api/destination/${this.sel.id}/reviews`).subscribe(r => this.rev = r); this.load(); },
      error: e => this.rmsg = e.error?.error || 'Could not post review.' });
  }
  rateStay(s: any, n: number) { this.http.post<any>(`/api/stays/${s.id}/rate`, { value: n }).subscribe(u => { Object.assign(s, u); this.sel.stays.sort((a: any, b: any) => b.avg - a.avg); this.loadExtras(); }); }
  addCoupon() { this.http.post('/api/admin/coupons', this.cf).subscribe({ next: () => { this.adminDone('Coupon created.'); }, error: e => this.adminFail(e) }); }
  delCoupon(c: any) { this.http.delete('/api/admin/coupons/' + c._id).subscribe({ next: () => this.openAdmin('Coupon deleted.', true), error: e => this.adminFail(e) }); }
  blank() { return { name: '', regionId: this.regionId, category: '', description: '', lat: '', lon: '', recDays: 2, activities: '', howToReach: '', hub: '', hours: 3, transport: 0, stay: 0, food: 0, activity: 0, image: '', bestTime: '' }; }
  openAdmin(msg = '', ok = false) {
    this.page = 'admin'; this.ef = this.ef || this.blank(); this.amsg = msg; this.aok = ok;
    this.http.get<any>('/api/admin/dashboard').subscribe(d => this.adm = d);
    this.http.get<any[]>('/api/destinations/search').subscribe(d => this.admDests = d);
  }
  editDest(d: any) {
    this.ef = { _id: d._id, name: d.name, regionId: d.region, category: d.category.join(', '), description: d.description, lat: d.lat, lon: d.lon, recDays: d.recDays,
      activities: d.activities.join(', '), howToReach: d.travel?.howToReach || '', hub: d.travel?.hub || '', hours: d.travel?.hours ?? 1,
      transport: d.cost.transport, stay: d.cost.stay, food: d.cost.food, activity: d.cost.activity, image: d.image || '', bestTime: d.bestTime || '' };
    window.scrollTo(0, 0);
  }
  adminDone(msg: string) { this.ef = this.blank(); this.openAdmin(msg, true); this.init(); }
  adminFail(e: any) { this.aok = false; this.amsg = e.error?.error || 'Action failed.'; window.scrollTo(0, 0); }
  saveDest() {   // uses the canonical endpoints of the API document
    const e = this.ef, id = e._id, fail = (x: any) => this.adminFail(x);
    const base = { name: e.name, regionId: e.regionId, category: e.category, description: e.description, lat: e.lat, lon: e.lon, recDays: e.recDays, activities: e.activities, image: e.image, bestTime: e.bestTime };
    const travel = { howToReach: e.howToReach, hub: e.hub, hours: e.hours }, cost = { transport: e.transport, stay: e.stay, food: e.food, activity: e.activity };
    if (id) this.http.put(`/api/destination/${id}`, { ...base, ...travel }).subscribe({ next: () => this.http.put(`/api/cost/${id}`, cost).subscribe({ next: () => this.adminDone('Destination updated.'), error: fail }), error: fail });
    else this.http.post<any>('/api/destinations', base).subscribe({ next: d => this.http.post('/api/travel-info', { destinationId: d.destinationId, ...travel }).subscribe({
      next: () => this.http.post('/api/costs', { destinationId: d.destinationId, ...cost }).subscribe({ next: () => this.adminDone('Destination added.'), error: fail }), error: fail }), error: fail });
  }
  delDest(d: any) { if (confirm(`Delete ${d.name} and its reviews, stays and photos?`)) this.http.delete(`/api/destination/${d._id}`).subscribe({ next: () => this.adminDone('Destination deleted.'), error: x => this.adminFail(x) }); }
  addCategory() { this.http.post('/api/categories', { name: this.nc }).subscribe({ next: () => { this.nc = ''; this.adminDone('Category added.'); }, error: x => this.adminFail(x) }); }
  addStay() { this.http.post('/api/stays', this.sf).subscribe({ next: () => this.adminDone('Stay added.'), error: x => this.adminFail(x) }); }
  addPhoto() { this.http.post('/api/photos', this.pf).subscribe({ next: () => this.adminDone('Photo added.'), error: x => this.adminFail(x) }); }
  saveRegion() {
    this.http.post('/api/admin/regions', this.rf).subscribe({ next: () => { this.rf = { name: '', hubName: '', hubLat: '', hubLon: '', description: '' }; this.adminDone('Region added.'); }, error: e => this.adminFail(e) });
  }
  delReview(r: any) { this.http.delete(`/api/review/${r._id}`).subscribe({ next: () => this.openAdmin('Review deleted.', true), error: e => this.adminFail(e) }); }
  openTrips() { this.page = 'trips'; this.http.get<any[]>('/api/itineraries').subscribe(t => this.trips = t); this.http.get<any[]>('/api/bookings').subscribe(b => this.myBookings = b); }
  openTrip(id: string) { this.lastReq = null; this.http.get<any>('/api/itinerary/' + id).subscribe(r => { r.itineraryId = id; this.showResult(r); }); }
  newMap(el: string, c: any, z: number) {
    const m = L.map(el).setView(c, z); this.maps.push(m);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(m); return m;
  }
  closeAll() { this.maps.forEach(m => m.remove()); this.maps = []; this.sel = null; this.res = null; }
}
