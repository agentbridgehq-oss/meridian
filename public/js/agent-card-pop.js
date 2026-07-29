/**
 * Meridian agent cards — pop on hover (CSS inject), black border when pressed.
 * Works with .agent-card (home) and .agent (legacy pricing cards).
 */
(function () {
  var STYLE_ID = 'meridian-agent-card-pop';
  if (!document.getElementById(STYLE_ID)) {
    var css = document.createElement('style');
    css.id = STYLE_ID;
    css.textContent = [
      '.agents-entry, .agents-entry-grid, .agent-grid { overflow: visible !important; }',
      '.agents-entry-grid { padding: 12px 6px 28px; }',
      '.agent-card, .agent {',
      '  transition: transform .28s cubic-bezier(.22,1,.36,1), border-color .18s ease, box-shadow .28s ease, filter .28s ease !important;',
      '  will-change: transform;',
      '  cursor: pointer;',
      '  -webkit-tap-highlight-color: transparent;',
      '}',
      '.agent-card:hover, .agent:hover {',
      '  z-index: 2;',
      '  transform: translateY(-12px) scale(1.035) !important;',
      '  filter: brightness(1.04);',
      '  border-color: rgba(255,255,255,0.2) !important;',
      '  box-shadow: 0 1px 0 rgba(255,255,255,0.08) inset, 0 32px 64px rgba(0,0,0,0.55), 0 12px 24px rgba(0,0,0,0.35) !important;',
      '}',
      '.agent-card:active, .agent-card.is-pressed, .agent-card:focus-visible,',
      '.agent:active, .agent.is-pressed, .agent:focus-visible {',
      '  z-index: 3;',
      '  transform: translateY(-8px) scale(1.02) !important;',
      '  border: 2px solid #000 !important;',
      '  outline: none;',
      '  box-shadow: 0 0 0 2px #000, 0 24px 48px rgba(0,0,0,0.5) !important;',
      '}',
      '@media (prefers-reduced-motion: reduce) {',
      '  .agent-card, .agent, .agent-card:hover, .agent:hover, .agent-card:active, .agent:active {',
      '    transform: none !important;',
      '  }',
      '}',
    ].join('\n');
    document.head.appendChild(css);
  }

  function wire(card) {
    if (card.dataset.popWired) return;
    card.dataset.popWired = '1';
    function on() { card.classList.add('is-pressed'); }
    function off() { card.classList.remove('is-pressed'); }
    card.addEventListener('pointerdown', on);
    card.addEventListener('pointerup', off);
    card.addEventListener('pointerleave', off);
    card.addEventListener('pointercancel', off);
    card.addEventListener('blur', off);
  }

  function scan() {
    document.querySelectorAll('.agent-card, .agent').forEach(wire);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
})();
