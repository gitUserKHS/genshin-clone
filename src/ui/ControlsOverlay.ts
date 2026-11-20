export class ControlsOverlay {
  public readonly el: HTMLElement;

  constructor(parent: HTMLElement, onClose: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'modal-overlay panel-modal hidden';
    this.el.innerHTML = `
      <div class="panel-card medium">
        <div class="panel-head">
          <h2>⌨ 조작 안내 · 티바트 모험 가이드</h2>
          <button class="modal-close-btn" type="button">✕ 닫기 (F1)</button>
        </div>
        <div class="controls-grid">
          <div><b>W A S D</b><span>이동 / 등반 / 수영</span></div>
          <div><b>Space</b><span>점프 / 공중 바람의 날개 활강</span></div>
          <div><b>Shift / 우클릭</b><span>대시 회피 · 모나/아야카 수면 질주</span></div>
          <div><b>좌클릭 (짧게/길게)</b><span>4연격 / 강공격 / 공중 낙하공격</span></div>
          <div><b>E / Q</b><span>원소 전투 스킬 / 원소 폭발 (컷신!)</span></div>
          <div><b>1 ~ 4</b><span>파티 캐릭터 교체</span></div>
          <div><b>V / 휠클릭</b><span>원소 시야 (보물·선령·기믹 탐지)</span></div>
          <div><b>F</b><span>신상·워프·보물상자·요리·비경 입장</span></div>
          <div><b>L / C / B</b><span>파티 편성(6인) / 성유물·무기 / 배낭</span></div>
          <div><b>M / F3 / T / P</b><span>월드맵 / 기원 / 시간 / 사진 모드</span></div>
          <div><b>H / Alt / Esc</b><span>스튜 회복 / 커서 표시 / 페이몬 메뉴</span></div>
        </div>
        <div class="reaction-guide">
          <b>원소 반응 & 기믹 팁:</b> 물+불 <b>증발</b> · 불+얼음 <b>융해</b> · 불+번개 <b>과부하</b> · 물+번개 <b>감전</b> · 바람 <b>확산</b> · 물+얼음 <b>빙결/쇄빙</b> · 바위 <b>결정화(실드)</b> · 종려 <b>옥홀 방패 & 운석 석화</b>!<br/>
          빛나는 <b>선령</b>을 따라가거나 <b>원소 비석</b>에 맞는 원소 스킬을 적중하면 숨겨진 보물상자가 나타납니다!
        </div>
      </div>
    `;
    parent.appendChild(this.el);
    this.el.querySelector('.modal-close-btn')!.addEventListener('click', () => onClose());
  }

  public open(): void {
    this.el.classList.remove('hidden');
  }

  public close(): void {
    this.el.classList.add('hidden');
  }
}
