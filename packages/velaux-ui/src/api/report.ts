import { getDomain } from '../utils/common';
import { get } from './request';

const projects = `${getDomain().APIBASE}/api/v1/projects`;

// listReports is the catalogue of built-in reports a project can run.
export function listReports(project: string) {
  return get(`${projects}/${project}/reports`, {}).then((res) => res);
}

// runReport runs a built-in report over one project.
export function runReport(project: string, id: string) {
  return get(`${projects}/${project}/reports/${id}`, {}).then((res) => res);
}
