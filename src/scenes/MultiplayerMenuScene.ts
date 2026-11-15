import Phaser from 'phaser';
import { mpClient, MPLobbyData, MPLobbyListEntry } from '../multiplayer/MultiplayerClient';
import { bodyStyle, buttonStyle, capCentreShift, smallStyle, UI_TEXT } from '../utils/TextStyles';
import { createSceneBackground } from '../ui/SceneBackground';
import { createButton, createPanel, UIButton } from '../ui/shared';
import { MenuNav } from '../ui/MenuNav';
import { addPageHeader, contentArea, GAP, TOUCH_MIN } from '../ui/kit';
import { createScrollList, type ScrollList } from '../ui/ScrollList';
import { addAchievementIcon } from '../ui/achievementIcon';
import { sceneManager } from '../systems/SceneManager';
import { getPlayerName, getPlayerNameOrDefault } from '../utils/Storage';
import { showNameInput } from '../ui/NameInputOverlay';
import { packs } from './DeferredLoadScene';
import { matchRequires } from '../config/packs';

const NAME_ROW_H = 56;
const PRIMARY_H = 56;
const PRIMARY_W = 420;
const ROW_H = 56;
const WAITING = 0x2f8a3a;
const PLAYING = 0x8a2f2f;
const WAITING_TEXT = '#9fe08a';
const PLAYING_TEXT = '#e0a040';

export class MultiplayerMenuScene extends Phaser.Scene {
  private page!: Phaser.GameObjects.Container;
  private list!: ScrollList;
  private nicknameText!: Phaser.GameObjects.Text;
  private nicknameRoom = 0;
  private nicknameCy = 0;
  private lobbies: MPLobbyListEntry[] = [];
  private lobbiesHandler!: (lobbies: MPLobbyListEntry[]) => void;
  private entering = false;
  /** Set when the scene is being shut down only to be built again: it stays in the lobby browser's room. */
  private rebuilding = false;
  private nav!: MenuNav;
  private onBack: () => void = () => {};
  private fixedButtons: UIButton[] = [];
  private createBtn!: UIButton;
  private listRect = { x: 0, y: 0, w: 0, h: 0 };

  constructor() {
    super({ key: 'MultiplayerMenuScene' });
  }

  /** viewport-fit: a new screen width builds this screen again: the list as it is, still browsing, nothing said to the server. */
  relayoutData(): { relayout: { lobbies: MPLobbyListEntry[] } } {
    this.rebuilding = true;
    return { relayout: { lobbies: this.lobbies } };
  }

  create(data?: { notice?: string; relayout?: { lobbies: MPLobbyListEntry[] } }): void {
    const { width, height } = this.cameras.main;
    // A join or create still being answered is not forgotten by a rebuild: a second tap must not start another
    this.entering = this.rebuilding && this.entering;
    this.rebuilding = false;
    const again = data?.relayout;
    if (again) this.lobbies = again.lobbies;

    createSceneBackground(this, { level: 6, dim: 0.55 });
    this.nav = new MenuNav(this);
    // What a match requires (every enemy's art) loads while the lobbies are browsed: the lobby only lets you be ready with it
    void packs(this.game)?.ensure(matchRequires());

    this.page = this.add.container(0, 0);
    const back = (): void => {
      sceneManager.goto(this, 'MenuScene', undefined, () => {
        mpClient.disconnect();
      });
    };
    const backBtn = addPageHeader(this, this.page, width, 'ZJAZD KARALUCHÓW', back);
    this.onBack = back;

    const area = contentArea(width, height);

    // --- Who you play as, and the way to change it ---
    this.page.add(createPanel(this, area.x, area.y, area.w, NAME_ROW_H));
    const nickname = getPlayerName();
    const nameBtnW = 128;
    const nameBtn = createButton(this, area.x + area.w - 4 - nameBtnW / 2, area.y + NAME_ROW_H / 2, nameBtnW, TOUCH_MIN, 'Zmień', 0x444444,
      buttonStyle({ fontSize: '10px' }), () => {
        this.nav.enabled = false;
        showNameInput(this, (newName) => {
          mpClient.setName(newName);
          this.setNickname(newName, true);
        }, undefined, () => { this.nav.enabled = true; });
      });
    this.page.add(nameBtn.all);
    const label = this.add.text(area.x + 16, area.y + NAME_ROW_H / 2, 'Grasz jako', bodyStyle({ fontSize: '12px', color: UI_TEXT.muted, strokeThickness: 0 })).setOrigin(0, 0.5);
    label.setY(Math.round(label.y + capCentreShift(label)));
    this.nicknameText = this.add.text(label.x + label.width + 12, area.y + NAME_ROW_H / 2, '', bodyStyle({ fontSize: '16px', strokeThickness: 0 })).setOrigin(0, 0.5);
    this.nicknameCy = area.y + NAME_ROW_H / 2;
    this.nicknameRoom = area.x + area.w - 4 - nameBtnW - 16 - this.nicknameText.x;
    this.page.add([label, this.nicknameText]);
    this.setNickname(nickname || getPlayerNameOrDefault(), Boolean(nickname));

    // --- The lobbies, a list that scrolls, and the one big way to start your own under it ---
    const listTop = area.y + NAME_ROW_H + GAP;
    const primaryY = area.y + area.h - PRIMARY_H;
    this.listRect = { x: area.x, y: listTop, w: area.w, h: primaryY - GAP - listTop };
    this.page.add(createPanel(this, this.listRect.x, this.listRect.y, this.listRect.w, this.listRect.h));
    this.list = createScrollList(this, this.page, this.listRect, { step: ROW_H + GAP });

    const primaryW = Math.min(PRIMARY_W, area.w);
    this.createBtn = createButton(this, width / 2, primaryY + PRIMARY_H / 2, primaryW, PRIMARY_H, 'Stwórz lobby', 0xe8c15a,
      buttonStyle({ fontSize: '16px' }), () => this.handleCreateLobby());
    this.page.add(this.createBtn.all);
    this.fixedButtons = [backBtn, nameBtn, this.createBtn];

    // --- CONNECT AND LISTEN FOR LOBBY UPDATES ---
    mpClient.connect();
    if (!again) mpClient.setName(getPlayerNameOrDefault());

    // Render initial empty state
    this.renderLobbies();

    // Listen for real-time lobby list pushes from server
    this.lobbiesHandler = (lobbies: MPLobbyListEntry[]) => {
      this.lobbies = lobbies;
      this.renderLobbies();
    };
    mpClient.on('lobbies:updated', this.lobbiesHandler);

    // Join the lobby-browser room on every (re)connect
    // (built again, it is in that room already: the call onConnect makes at once for a live connection is skipped)
    let inRoom = again !== undefined;
    const browseHandler = (): void => {
      if (inRoom) { inRoom = false; return; }
      mpClient.startBrowsing();
    };
    mpClient.onConnect(browseHandler);
    // Not connected yet: nothing was called at once, and the first connect still joins
    inRoom = false;

    // Cleanup on scene shutdown
    this.events.once('shutdown', () => {
      mpClient.off('lobbies:updated', this.lobbiesHandler);
      mpClient.offConnect(browseHandler);
      if (!this.rebuilding) mpClient.stopBrowsing();
    });

    // Phaser keeps a scene's data when it is next started without any: a later visit must not show an old notice
    this.sys.settings.data = {};

    if (data?.notice) this.showNotice(data.notice);
  }

  /** The name under "Grasz jako": the chosen one in green, the default in bone, cut to the room beside the button. */
  private setNickname(name: string, chosen: boolean): void {
    this.nicknameText.setColor(chosen ? UI_TEXT.named : UI_TEXT.bone);
    let shown = name;
    this.nicknameText.setText(shown);
    while (this.nicknameText.width > this.nicknameRoom && shown.length > 1) {
      shown = shown.slice(0, -1);
      this.nicknameText.setText(`${shown.trimEnd()}…`);
    }
    this.nicknameText.setY(Math.round(this.nicknameCy + capCentreShift(this.nicknameText)));
  }

  private showNotice(message: string): void {
    const { x, y, w, h } = this.listRect;
    const notice = this.add.text(x + w / 2, y + h - 28, message, bodyStyle({ fontSize: '12px', color: '#e07a6a', strokeThickness: 3 })).setOrigin(0.5);
    notice.setY(Math.round(notice.y + capCentreShift(notice)));
    const slab = this.add.graphics().fillStyle(0x15100d, 0.95).fillRect(Math.round(notice.x - notice.width / 2 - 16), y + h - 28 - 20, notice.width + 32, 40);
    this.page.add([slab, notice]);
    this.tweens.add({
      targets: [notice, slab],
      alpha: 0,
      delay: 3000,
      duration: 500,
      onComplete: () => { notice.destroy(); slab.destroy(); },
    });
  }

  private renderLobbies(): void {
    const { x, y, w, h } = this.listRect;
    const content = this.list.content;
    content.removeAll(true);

    if (this.lobbies.length === 0) {
      const midX = Math.round(x + w / 2);
      const midY = Math.round(y + h / 2);
      const picture = addAchievementIcon(this, midX, midY - 40, 'ach-chat').setAlpha(0.75);
      const heading = this.add.text(midX, midY + 8, 'Pusto tu...', bodyStyle({ fontSize: '16px', color: UI_TEXT.bone })).setOrigin(0.5);
      heading.setY(midY + 8 + capCentreShift(heading));
      const line = this.add.text(midX, midY + 36, 'Stwórz lobby i zaczynaj imprezę!\nDo 16 karaluchów na jednym torze.', smallStyle({
        fontSize: '10px', color: UI_TEXT.muted, strokeThickness: 0, align: 'center', wordWrap: { width: w - 64 },
      })).setOrigin(0.5, 0);
      content.add([picture, heading, line]);
      this.nav.set(this.fixedButtons, { initial: this.createBtn, onBack: this.onBack });
      this.list.setContentHeight(0);
      return;
    }

    const rows: UIButton[] = [];
    const rowW = w - 28;
    const left = x + 8;
    this.lobbies.forEach((lobby, i) => {
      const cy = y + 8 + i * (ROW_H + GAP) + ROW_H / 2;
      // A lobby in a run can be joined too: you watch until the next one
      const playing = lobby.status === 'ingame';
      const row = createButton(this, left + rowW / 2, cy, rowW, ROW_H, '', playing ? PLAYING : WAITING, buttonStyle({ fontSize: '10px' }), () => this.handleJoinLobby(lobby.id));
      content.add(row.all);
      rows.push(row);

      const text = (tx: number, content_: string, color: string, size: string, originX: number): Phaser.GameObjects.Text => {
        const t = this.add.text(tx, cy, content_, bodyStyle({ fontSize: size, color, strokeThickness: 0 })).setOrigin(originX, 0.5);
        t.setY(Math.round(cy + capCentreShift(t)));
        content.add(t);
        return t;
      };
      const right = left + rowW - 16;
      const count = text(right, `${lobby.playerCount}/16`, UI_TEXT.bone, '16px', 1);
      const status = text(right - count.width - 16, playing ? 'w grze · oglądaj' : 'czeka', playing ? PLAYING_TEXT : WAITING_TEXT, '12px', 1);
      const name = text(left + 24, lobby.host, UI_TEXT.bone, '16px', 0);
      const room = status.x - status.width - 12 - name.x;
      let shown = lobby.host;
      while (name.width > room && shown.length > 1) {
        shown = shown.slice(0, -1);
        name.setText(`${shown.trimEnd()}…`);
      }
    });
    this.list.setContentHeight(8 + this.lobbies.length * (ROW_H + GAP) + 8 - GAP);
    this.nav.set([...this.fixedButtons, ...rows], { initial: rows.find(r => r.enabled) ?? this.createBtn, onBack: this.onBack, scroll: this.list });
  }

  private async enterLobby(request: () => Promise<MPLobbyData>, failure: string): Promise<void> {
    if (this.entering) return;
    this.entering = true;
    mpClient.setName(getPlayerNameOrDefault());
    try {
      const lobbyData = await request();
      // Left for the menu meanwhile: the lobby just joined is left again, not walked into
      if (!this.scene.isActive()) {
        mpClient.leaveLobby();
        return;
      }
      const run = mpClient.takeRunInProgress();
      if (run) {
        // Watching draws the course: its art first (a match never waits in the game), the run's clock moved on meanwhile
        const asked = Date.now();
        if ((await packs(this.game).ensure(matchRequires())).length > 0) {
          mpClient.leaveLobby();
          throw new Error('packs');
        }
        sceneManager.goto(this, 'GameScene', {
          multiplayer: true,
          seed: run.seed,
          players: run.players,
          myId: mpClient.myId,
          watch: { elapsedMs: run.elapsedMs + Date.now() - asked, dead: run.dead },
        });
      } else {
        sceneManager.goto(this, 'LobbyScene', { lobbyData });
      }
    } catch {
      this.entering = false;
      if (this.scene.isActive()) this.showNotice(failure);
    }
  }

  private handleJoinLobby(lobbyId: string): void {
    void this.enterLobby(() => mpClient.joinLobby(lobbyId), 'Nie udało się dołączyć do lobby');
  }

  private handleCreateLobby(): void {
    void this.enterLobby(() => mpClient.createLobby(), 'Nie udało się stworzyć lobby');
  }
}
