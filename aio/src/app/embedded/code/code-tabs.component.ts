/* tslint:disable component-selector */
import { Component, ElementRef, OnInit } from '@angular/core';

export interface TabInfo {
  class: string|null;
  code: string;
  language: string|null;
  linenums: any;
  path: string;
  region: string;
  title: string|null;
}

/**
 * An embedded component used to generate tabbed code panes inside docs
 *
 * The innerHTML of the `<code-tabs>` component should contain `<code-pane>` elements.
 * Each `<code-pane>` has the same interface as the embedded `<code-example>` component.
 * The optional `linenums` attribute is the default `linenums` for each code pane.
 */
@Component({
  selector: 'code-tabs',
  template: `
    <mat-tab-group class="code-tab-group" disableRipple>
      <mat-tab style="overflow-y: hidden;" *ngFor="let tab of tabs">
        <ng-template mat-tab-label>
          <span class="{{ tab.class }}">{{ tab.title }}</span>
        </ng-template>
        <aio-code class="{{ tab.class }}"
          [code]="tab.code"
          [language]="tab.language"
          [linenums]="tab.linenums"
          [path]="tab.path"
          [region]="tab.region"
          [title]="tab.title">
        </aio-code>
      </mat-tab>
    </mat-tab-group>
  `
})
export class CodeTabsComponent implements OnInit {
  tabs: TabInfo[];
  linenumsDefault: string;

  constructor(private elementRef: ElementRef) { }

  ngOnInit() {
    const element = this.elementRef.nativeElement;
    this.linenumsDefault = this.getLinenums(element);

    // The `codeTabsContent` property is set by the DocViewer when it builds this component.
    // It is the original innerHTML of the host element.
    const content = element.codeTabsContent;
    this.processContent(content);
  }

  processContent(content: string) {
    // We add it to an element so that we can easily parse the HTML
    const element = document.createElement('div');
    // **Security:** `codeTabsContent` is provided by docs authors and as such is considered to
    // be safe for innerHTML purposes.
    element.innerHTML = content;

    this.tabs = [];
    const codeExamples = element.querySelectorAll('code-pane');
    for (let i = 0; i < codeExamples.length; i++) {
      const codeExample = codeExamples.item(i);
      const tab = {
        class: codeExample.getAttribute('class'),
        code: codeExample.innerHTML,
        language: codeExample.getAttribute('language'),
        linenums: this.getLinenums(codeExample),
        path: codeExample.getAttribute('path') || '',
        region: codeExample.getAttribute('region') || '',
        title: codeExample.getAttribute('title')
      };
      this.tabs.push(tab);
    }
  }

  getLinenums(element: Element) {
    const linenums = element.getAttribute('linenums');
    return linenums == null ? this.linenumsDefault : linenums;
  }
}
