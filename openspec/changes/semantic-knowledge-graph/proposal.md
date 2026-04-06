# Proposal: Semantic Knowledge Graph

## Overview
Upgrading the current Knowledge Graph from a "File Dependency Graph" to a true "Semantic Knowledge Graph". The new graph will represent `Concepts`, `Workflows`, `DataModels`, `Components`, and `CodeEntities` as nodes, and semantic relationships such as `IMPLEMENTS`, `MUTATES`, `TRIGGERS`, and `DEPENDS_ON` as edges.

## Motivation
Currently, the knowledge graph models files and their static dependencies. This lacks the rich context needed to deeply understand how a codebase operates structurally and conceptually. A semantic representation allows for more advanced reasoning, better chapter generation, and an improved UI visualization.

## Goals
- Multi-pass analysis in `pyharness/phases/analyze.py`:
  1. Global Discovery
  2. Semantic Mapping
  3. Consolidation
- Frontend updates to render the new node and edge types dynamically.
- Update data schemas to support semantic nodes and relationships.