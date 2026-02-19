// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

/**
 * Sigma File Manager Extension SDK Type Definitions
 *
 * Extension developers can use these types by:
 * 1. Downloading this file and placing it in their project
 * 2. Referencing it in tsconfig.json:
 *    {
 *      "compilerOptions": {
 *        "typeRoots": ["./types", "./node_modules/@types"]
 *      }
 *    }
 * 3. Or importing from GitHub raw URL (if your tooling supports it)
 *
 * @version 1.1.0
 * @see https://github.com/aleksey-hoffman/sigma-file-manager
 */

declare global {
  const sigma: SigmaExtensionAPI;
}

export type ExtensionType = 'api' | 'iframe' | 'webview';

export type ExtensionPermission
  = | 'contextMenu'
    | 'sidebar'
    | 'toolbar'
    | 'commands'
    | 'fs.read'
    | 'fs.write'
    | 'notifications'
    | 'dialogs'
    | 'shell';

export type ExtensionActivationEvent
  = | 'onStartup'
    | 'onInstall'
    | 'onUninstall'
    | 'onEnable'
    | 'onDisable'
    | 'onUpdate'
    | `onCommand:${string}`;

export interface ExtensionPublisher {
  name: string;
  url?: string;
}

export type ExtensionCommandArgumentType = 'text' | 'password' | 'dropdown';

export interface ExtensionCommandArgumentDropdownOption {
  title: string;
  value: string;
}

export interface ExtensionCommandArgument {
  name: string;
  type: ExtensionCommandArgumentType;
  placeholder: string;
  required?: boolean;
  data?: ExtensionCommandArgumentDropdownOption[];
}

export interface ExtensionCommand {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  arguments?: ExtensionCommandArgument[];
}

export interface ExtensionContextMenuItem {
  id: string;
  title: string;
  icon?: string;
  when?: ExtensionContextMenuCondition;
  group?: string;
  order?: number;
}

export interface ExtensionContextMenuCondition {
  selectionType?: 'single' | 'multiple' | 'any';
  entryType?: 'file' | 'directory' | 'any';
  fileExtensions?: string[];
}

export interface ExtensionSidebarItem {
  id: string;
  title: string;
  icon: string;
  order?: number;
}

export interface ExtensionToolbarDropdown {
  id: string;
  title: string;
  icon?: string;
  items: ExtensionToolbarDropdownItem[];
}

export interface ExtensionToolbarDropdownItem {
  id: string;
  title: string;
  icon?: string;
  commandId?: string;
  separator?: boolean;
}

export type ConfigurationPropertyType = 'string' | 'number' | 'boolean' | 'array';

export interface ConfigurationProperty {
  type: ConfigurationPropertyType;
  default?: unknown;
  description?: string;
  enum?: (string | number)[];
  enumDescriptions?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  items?: {
    type: 'string' | 'number';
  };
}

export interface ExtensionConfiguration {
  title?: string;
  properties: Record<string, ConfigurationProperty>;
}

export type ExtensionKeybindingWhen
  = | 'always'
    | 'fileSelected'
    | 'directorySelected'
    | 'singleSelected'
    | 'multipleSelected'
    | 'navigatorFocused';

export interface ExtensionKeybinding {
  command: string;
  key: string;
  when?: ExtensionKeybindingWhen;
}

export interface ExtensionContributions {
  commands?: ExtensionCommand[];
  contextMenu?: ExtensionContextMenuItem[];
  sidebar?: ExtensionSidebarItem[];
  toolbar?: ExtensionToolbarDropdown[];
  configuration?: ExtensionConfiguration;
  keybindings?: ExtensionKeybinding[];
}

export interface ExtensionEngines {
  sigmaFileManager: string;
}

export interface ExtensionManifest {
  id: string;
  name: string;
  previousName?: string;
  version: string;
  publisher?: ExtensionPublisher;
  repository: string;
  license: string;
  icon?: string;
  banner?: string;
  categories?: string[];
  tags?: string[];
  type: ExtensionType;
  main: string;
  permissions: ExtensionPermission[];
  activationEvents?: ExtensionActivationEvent[];
  contributes?: ExtensionContributions;
  platforms?: PlatformOS[];
  engines: ExtensionEngines;
}

export interface Disposable {
  dispose(): void;
}

export interface ContextMenuContext {
  selectedEntries: {
    path: string;
    name: string;
    isDirectory: boolean;
    size?: number;
    extension?: string;
  }[];
}

export interface NotificationOptions {
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

export interface DialogOptions {
  title: string;
  message: string;
  type?: 'info' | 'confirm' | 'prompt';
  confirmText?: string;
  cancelText?: string;
  defaultValue?: string;
}

export interface DialogResult {
  confirmed: boolean;
  value?: string;
}

export type ProgressLocation = 'notification' | 'statusBar';

export interface ProgressOptions {
  title: string;
  location?: ProgressLocation;
  cancellable?: boolean;
}

export interface ProgressReport {
  message?: string;
  increment?: number;
}

export interface Progress {
  report(value: ProgressReport): void;
}

export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): Disposable;
}

export interface DirEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: number;
}

export interface ContextEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  extension: string | null;
  createdAt: number;
  modifiedAt: number;
}

export interface BuiltinCommandInfo {
  id: string;
  title: string;
  description: string;
}

export interface FileDialogFilter {
  name: string;
  extensions: string[];
}

export interface OpenFileDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileDialogFilter[];
  multiple?: boolean;
  directory?: boolean;
}

export interface SaveFileDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileDialogFilter[];
}

export type PlatformOS = 'windows' | 'macos' | 'linux';
export type PlatformArch = 'x64' | 'arm64' | 'x86';

export interface BinaryInstallOptions {
  name: string;
  downloadUrl: string | ((platform: PlatformOS) => string);
  executable?: string;
  version?: string;
}

export interface BinaryInfo {
  id: string;
  path: string;
  version?: string;
  installedAt: number;
}

export type UIElementType = 'input' | 'select' | 'checkbox' | 'textarea' | 'button' | 'separator' | 'text';

export interface UISelectOption {
  value: string;
  label: string;
}

export interface UIElement {
  type: UIElementType;
  id?: string;
  label?: string;
  placeholder?: string;
  value?: string | boolean | number;
  options?: UISelectOption[];
  rows?: number;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

export interface ModalButton {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface ModalOptions {
  title: string;
  width?: number;
  content: UIElement[];
  buttons?: ModalButton[];
}

export interface ModalHandle {
  onSubmit(callback: (values: Record<string, unknown>, buttonId: string) => void): void;
  onClose(callback: () => void): void;
  close(): void;
  updateElement(id: string, updates: Partial<UIElement>): void;
  getValues(): Record<string, unknown>;
}

export interface SigmaExtensionAPI {
  contextMenu: {
    registerItem(
      item: ExtensionContextMenuItem,
      handler: (context: ContextMenuContext) => Promise<void> | void
    ): Disposable;
  };

  sidebar: {
    registerPage(page: ExtensionSidebarItem): Disposable;
  };

  toolbar: {
    registerDropdown(
      dropdown: ExtensionToolbarDropdown,
      handlers: Record<string, () => Promise<void> | void>
    ): Disposable;
  };

  commands: {
    registerCommand(
      command: ExtensionCommand,
      handler: (...args: unknown[]) => Promise<unknown> | unknown
    ): Disposable;
    executeCommand(commandId: string, ...args: unknown[]): Promise<unknown>;
    getBuiltinCommands(): BuiltinCommandInfo[];
  };

  context: {
    getCurrentPath(): string | null;
    getSelectedEntries(): ContextEntry[];
    getAppVersion(): Promise<string>;
    getDownloadsDir(): Promise<string>;
    onPathChange(callback: (path: string | null) => void): Disposable;
    onSelectionChange(callback: (entries: ContextEntry[]) => void): Disposable;
  };

  fs: {
    readFile(path: string): Promise<Uint8Array>;
    writeFile(path: string, data: Uint8Array): Promise<void>;
    readDir(path: string): Promise<DirEntry[]>;
    exists(path: string): Promise<boolean>;
    downloadFile(url: string, path: string): Promise<void>;
  };

  ui: {
    showNotification(options: NotificationOptions): void;
    showDialog(options: DialogOptions): Promise<DialogResult>;
    withProgress<T>(
      options: ProgressOptions,
      task: (progress: Progress, token: CancellationToken) => Promise<T>
    ): Promise<T>;
    createModal(options: ModalOptions): ModalHandle;
    input(options: { id: string; label?: string; placeholder?: string; value?: string; disabled?: boolean }): UIElement;
    select(options: { id: string; label?: string; placeholder?: string; options: UISelectOption[]; value?: string; disabled?: boolean }): UIElement;
    checkbox(options: { id: string; label?: string; checked?: boolean; disabled?: boolean }): UIElement;
    textarea(options: { id: string; label?: string; placeholder?: string; value?: string; rows?: number; disabled?: boolean }): UIElement;
    separator(): UIElement;
    text(content: string): UIElement;
  };

  dialog: {
    openFile(options?: OpenFileDialogOptions): Promise<string | string[] | null>;
    saveFile(options?: SaveFileDialogOptions): Promise<string | null>;
  };

  shell: {
    run(
      commandPath: string,
      args?: string[]
    ): Promise<{ code: number;
      stdout: string;
      stderr: string; }>;
    runWithProgress(
      commandPath: string,
      args: string[] | undefined,
      onProgress?: (payload: { taskId: string; line: string; isStderr: boolean }) => void
    ): Promise<{
      taskId: string;
      result: Promise<{ code: number;
        stdout: string;
        stderr: string; }>;
      cancel: () => Promise<void>;
    }>;
  };

  settings: {
    get<T>(key: string): Promise<T>;
    set<T>(key: string, value: T): Promise<void>;
    getAll(): Promise<Record<string, unknown>>;
    reset(key: string): Promise<void>;
    onChange(key: string, callback: (newValue: unknown, oldValue: unknown) => void): Disposable;
  };

  storage: {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
    remove(key: string): Promise<void>;
  };

  platform: {
    readonly os: PlatformOS;
    readonly arch: PlatformArch;
    readonly pathSeparator: string;
    readonly isWindows: boolean;
    readonly isMacos: boolean;
    readonly isLinux: boolean;
    joinPath(...segments: string[]): string;
  };

  binary: {
    ensureInstalled(id: string, options: BinaryInstallOptions): Promise<string>;
    getPath(id: string): Promise<string | null>;
    isInstalled(id: string): Promise<boolean>;
    remove(id: string): Promise<void>;
    getInfo(id: string): Promise<BinaryInfo | null>;
  };
}

export interface ExtensionActivationContext {
  extensionPath: string;
  storagePath: string;
  activationEvent: ExtensionActivationEvent;
}

export interface ExtensionModule {
  activate?(context: ExtensionActivationContext): Promise<void> | void;
  deactivate?(): Promise<void> | void;
}

export {};
