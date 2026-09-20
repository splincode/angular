/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {Reference} from '../../imports';
import {DirectiveMeta, MetadataReader, MetaKind, PipeMeta} from '../../metadata';
import {ClassDeclaration, ReflectionHost} from '../../reflection';
import {ComponentScopeKind, ComponentScopeReader, SelectorlessScope} from './api';
import ts from 'typescript';

/**
 * Computes the scope for a selectorless component by looking at imports within the same
 * file and resolving them to metadata.
 */
export class SelectorlessComponentScopeReader implements ComponentScopeReader {
  private cache = new Map<ClassDeclaration, SelectorlessScope | null>();

  constructor(
    private metaReader: MetadataReader,
    private reflector: ReflectionHost,
  ) {}

  getScopeForComponent(node: ClassDeclaration): SelectorlessScope | null {
    if (this.cache.has(node)) {
      return this.cache.get(node)!;
    }

    const clazzRef = new Reference(node);
    const meta = this.metaReader.getDirectiveMetadata(clazzRef);

    if (meta === null || !meta.isComponent || !meta.isStandalone || !meta.selectorlessEnabled) {
      this.cache.set(node, null);
      return null;
    }

    const eligibleIdentifiers = this.getAvailableIdentifiers(node);
    const dependencies = new Map<string, DirectiveMeta | PipeMeta>();
    const dependencyIdentifiers: ts.Identifier[] = [];
    let isPoisoned = meta.isPoisoned;

    for (const [name, identifier] of eligibleIdentifiers) {
      if (ts.isNamespaceImport(identifier.parent)) {
        for (const [qualifiedName, dep] of this.getMetaFromNamespace(meta, name, identifier)) {
          dependencies.set(qualifiedName, dep);

          if (dep.kind === MetaKind.Directive && dep.isPoisoned) {
            isPoisoned = true;
          }
        }
        continue;
      }

      if (dependencies.has(name)) {
        continue;
      }

      const dep = this.getMetaFromIdentifier(meta, name, identifier);

      if (dep !== null) {
        dependencies.set(name, dep);
        dependencyIdentifiers.push(identifier);

        if (dep.kind === MetaKind.Directive && dep.isPoisoned) {
          isPoisoned = true;
        }
      }
    }

    const scope: SelectorlessScope = {
      kind: ComponentScopeKind.Selectorless,
      component: node,
      dependencies,
      dependencyIdentifiers,
      isPoisoned,
      schemas: meta.schemas ?? [],
    };

    this.cache.set(node, scope);
    return scope;
  }

  getRemoteScope(): null {
    return null;
  }

  /** Determines which identifiers a class has access to. */
  private getAvailableIdentifiers(node: ClassDeclaration): Map<string, ts.Identifier> {
    const result = new Map<string, ts.Identifier>();
    let current = ts.getOriginalNode(node).parent;

    while (current) {
      // Note: doesn't account for some cases like function parameters,
      // but we likely don't want to support those anyways.
      if (!ts.isSourceFile(current) && !ts.isBlock(current)) {
        current = current.parent;
        continue;
      }

      for (const stmt of current.statements) {
        if (this.reflector.isClass(stmt)) {
          result.set(stmt.name.text, stmt.name);
          continue;
        }

        if (
          ts.isImportDeclaration(stmt) &&
          stmt.importClause !== undefined &&
          !(stmt.importClause.phaseModifier === ts.SyntaxKind.TypeKeyword)
        ) {
          const clause = stmt.importClause;
          if (clause.namedBindings !== undefined) {
            if (ts.isNamedImports(clause.namedBindings)) {
              for (const element of clause.namedBindings.elements) {
                if (!element.isTypeOnly) {
                  result.set(element.name.text, element.name);
                }
              }
            } else if (ts.isNamespaceImport(clause.namedBindings)) {
              result.set(clause.namedBindings.name.text, clause.namedBindings.name);
            }
          }
          if (clause.name !== undefined) {
            result.set(clause.name.text, clause.name);
          }
          continue;
        }
      }

      current = current.parent;
    }

    return result;
  }

  private getMetaFromNamespace(
    meta: DirectiveMeta,
    localName: string,
    node: ts.Identifier,
  ): Map<string, DirectiveMeta | PipeMeta> {
    const result = new Map<string, DirectiveMeta | PipeMeta>();
    if (meta.localReferencedSymbols === null) {
      return result;
    }

    const prefix = `${localName}.`;
    const referencedSymbols = Array.from(meta.localReferencedSymbols).filter((name) =>
      name.startsWith(prefix),
    );
    if (referencedSymbols.length === 0) {
      return result;
    }

    const declaration = this.reflector.getDeclarationOfIdentifier(node);
    if (declaration === null || !ts.isSourceFile(declaration.node)) {
      return result;
    }

    const exports = this.reflector.getExportsOfModule(declaration.node);
    if (exports === null) {
      return result;
    }

    for (const qualifiedName of referencedSymbols) {
      const exportName = qualifiedName.slice(prefix.length);
      if (exportName.length === 0 || exportName.includes('.')) {
        continue;
      }

      const exportedDeclaration = exports.get(exportName);
      if (exportedDeclaration === undefined || !this.reflector.isClass(exportedDeclaration.node)) {
        continue;
      }

      const ref = new Reference(exportedDeclaration.node);
      const dep =
        this.metaReader.getDirectiveMetadata(ref) ?? this.metaReader.getPipeMetadata(ref);
      if (dep !== null) {
        result.set(qualifiedName, dep);
      }
    }

    return result;
  }

  private getMetaFromIdentifier(
    meta: DirectiveMeta,
    localName: string,
    node: ts.Identifier,
  ): DirectiveMeta | PipeMeta | null {
    // Consult the set of used names in the template so we don't hit the type checker for every
    // import in the file. Most likely a subset of imports in the file will be used in the template.
    if (meta.localReferencedSymbols === null || !meta.localReferencedSymbols.has(localName)) {
      return null;
    }

    const declaration = this.reflector.getDeclarationOfIdentifier(node);
    if (declaration === null || !this.reflector.isClass(declaration.node)) {
      return null;
    }
    const ref = new Reference(declaration.node);
    return this.metaReader.getDirectiveMetadata(ref) ?? this.metaReader.getPipeMetadata(ref);
  }
}
