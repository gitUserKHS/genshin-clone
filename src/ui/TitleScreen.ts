export class TitleScreen {
  public readonly el: HTMLElement;
  private onStart: () => void;

  constructor(parent: HTMLElement, onStart: () => void) {
    this.onStart = onStart;
    this.el = document.createElement('div');
    this.el.className = 'title-screen';
    this.el.innerHTML = `
      <div class="title-vignette"></div>
      <div class="title-center">
        <div class="title-emblem">✦ TEYVAT · MONDSTADT ✦</div>
        <h1 class="title-logo">원신</h1>
        <div class="title-subtitle">바람이 시작되는 곳 · Song of the Gentle Wind</div>
        <button class="title-start-btn" type="button">
          <span class="btn-diamond">❖</span>
          <span>문 열기 · 클릭하여 여행 시작</span>
          <span class="btn-diamond">❖</span>
        </button>
        <div class="title-hints">
          <span>WASD 이동</span>
          <span>Space 점프/활강</span>
          <span>좌클릭 공격</span>
          <span>E 스킬 / Q 원소폭발</span>
          <span>1~4 캐릭터 교체</span>
          <span>M 지도 / F3 기원</span>
        </div>
      </div>
      <div class="title-footer">Three.js WebGL2 Real-time Cel-Shaded Open World</div>
    `;

    const btn = this.el.querySelector('.title-start-btn') as HTMLButtonElement;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismiss();
    });
    this.el.addEventListener('click', () => {
      this.dismiss();
    });

    parent.appendChild(this.el);
  }

  private dismiss(): void {
    if (this.el.classList.contains('title-hidden')) return;
    this.el.classList.add('title-hidden');
    setTimeout(() => {
      this.el.style.display = 'none';
    }, 550);
    this.onStart();
  }
}
