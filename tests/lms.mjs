// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// Pages and data of the LMS for tests: a course page with a sidebar, and the
// cache of assignments the extension keeps, so that the panel can be drawn
// without fetching anything.
import { openTab, settle } from "../harness/index.mjs";

export const LMS = "https://lms.gakusei.kyoto-u.ac.jp";
export const H = 3600e3;
export const D = 24 * H;

// A course page whose sidebar lists course C1 with its Assignments and Tests
// & Quizzes tools, and says the user is logged in, as Sakai's pages do.
export const COURSE_PAGE = `<!doctype html><html><head></head><body>
<script>var portal = {"loggedIn": true};</script>
<div id="sakai-system-indicators"></div>
<nav id="portal-nav-sidebar"><ul>
 <li class="site-list-item" id="site-list-item-C1">
  <div class="site-list-item-head"><a href="/portal/site/C1">[2026前期月１]線形代数</a></div>
  <ul class="site-page-list">
   <li class="nav-item"><a href="/portal/site/C1/tool/ASSIGN"><span>課題</span></a></li>
   <li class="nav-item"><a href="/portal/site/C1/tool/QUIZ"><span>テスト・クイズ</span></a></li>
  </ul></li></ul></nav></body></html>`;

export function assignment(id, name, deadline, extra = {}) {
  return {
    courseName: "線形代数", courseId: "C1", name, url: `${LMS}/portal/site/C1/tool/ASSIGN`,
    deadline, closeTime: deadline, status: "", grade: "", entityId: id, type: "assignment", ...extra,
  };
}

// The stored cache of assignments, fresh enough that the panel draws from it.
export const cached = (assignments) => ({ "kulms-assignments": { timestamp: Date.now(), assignments } });

export function openCoursePage(browser, options = {}) {
  return openTab(browser, { url: `${LMS}/portal/site/C1`, html: COURSE_PAGE, ...options });
}

// Opens the assignment panel once the page has loaded its settings and state.
export async function openPanel(tab) {
  await settle(300);
  tab.document.getElementById("kulms-assign-toggle").click();
  await settle(100);
  return tab.document.getElementById("kulms-assign-panel");
}
