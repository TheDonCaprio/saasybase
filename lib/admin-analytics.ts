import { prisma } from './prisma';
import { Logger } from './logger';
import { toError } from './runtime-guards';
import type { AdminAnalyticsPeriod, AdminAnalyticsResponse } from './admin-analytics-shared';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getAdminAnalytics(period: AdminAnalyticsPeriod = '30d'): Promise<AdminAnalyticsResponse> {
	try {
		const now = new Date();
		const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
		const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
		const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
		let startDate: Date;
		const endDate: Date = now;

		switch (period) {
			case 'today':
				startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
				break;
			case 'yesterday':
				startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
				break;
			case '1d':
				startDate = new Date(now.getTime() - 1 * DAY_MS);
				break;
			case '7d':
				startDate = new Date(now.getTime() - 7 * DAY_MS);
				break;
			case '30d':
				startDate = new Date(now.getTime() - 30 * DAY_MS);
				break;
			case '90d':
				startDate = new Date(now.getTime() - 90 * DAY_MS);
				break;
			case '3m':
				startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
				break;
			case '6m':
				startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
				break;
			case '1y':
				startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
				break;
			case 'all':
				startDate = new Date('2020-01-01');
				break;
			default:
				startDate = new Date(now.getTime() - 30 * DAY_MS);
		}

		const periodLength = endDate.getTime() - startDate.getTime();
		const previousStartDate = new Date(startDate.getTime() - periodLength);
		const previousEndDate = new Date(startDate.getTime());

		const [
			totalRevenue,
			currentPeriodRevenue,
			previousPeriodRevenue,
			dailyRevenue,
			yesterdayRevenue,
			totalUsers,
			activeUsers,
			currentPeriodUsers,
			previousPeriodUsers,
			usersByDay,
			usersToday,
			usersThisWeek,
			totalSubs,
			activeSubs,
			pendingSubs,
			canceledSubs,
			planRevenue,
			featureUsage,
			currentPeriodSubs,
			previousPeriodSubs,
			_currentPeriodFeatureUsage,
			_previousPeriodFeatureUsage,
			revenueByDay,
			subscriptionsByDay,
			totalVisits,
			currentPeriodVisits,
			previousPeriodVisits,
			uniqueVisitors,
			visitsByCountry,
			pageViews
		] = await Promise.all([
			prisma.payment.aggregate({
				_sum: { amountCents: true },
				where: { status: { in: ['COMPLETED', 'SUCCEEDED'] } }
			}),
			prisma.payment.aggregate({
				_sum: { amountCents: true },
				where: {
					status: { in: ['COMPLETED', 'SUCCEEDED'] },
					createdAt: { gte: startDate, lt: endDate }
				}
			}),
			prisma.payment.aggregate({
				_sum: { amountCents: true },
				where: {
					status: { in: ['COMPLETED', 'SUCCEEDED'] },
					createdAt: { gte: previousStartDate, lt: previousEndDate }
				}
			}),
			prisma.payment.aggregate({
				_sum: { amountCents: true },
				where: {
					status: { in: ['COMPLETED', 'SUCCEEDED'] },
					createdAt: { gte: startOfToday, lt: startOfTomorrow }
				}
			}),
			prisma.payment.aggregate({
				_sum: { amountCents: true },
				where: {
					status: { in: ['COMPLETED', 'SUCCEEDED'] },
					createdAt: { gte: startOfYesterday, lt: startOfToday }
				}
			}),
			prisma.user.count(),
			prisma.user.count({
				where: { subscriptions: { some: { status: 'ACTIVE' } } }
			}),
			prisma.user.count({ where: { createdAt: { gte: startDate, lt: endDate } } }),
			prisma.user.count({
				where: { createdAt: { gte: previousStartDate, lt: previousEndDate } }
			}),
			prisma.$queryRaw`
				SELECT date(createdAt/1000, 'unixepoch') as date, COUNT(*) as users
				FROM User
				WHERE createdAt >= ${startDate.getTime()} AND createdAt < ${endDate.getTime()}
				GROUP BY date(createdAt/1000, 'unixepoch')
				ORDER BY date DESC
			`,
			prisma.user.count({ where: { createdAt: { gte: startOfToday, lt: startOfTomorrow } } }),
			prisma.user.count({ where: { createdAt: { gte: startOfWeek, lt: startOfTomorrow } } }),
			prisma.subscription.count(),
			prisma.subscription.count({ where: { status: 'ACTIVE' } }),
			prisma.subscription.count({ where: { status: 'PENDING' } }),
			// Count canonical 'CANCELLED' only now that DB rows have been normalized
			prisma.subscription.count({ where: { status: 'CANCELLED' } }),
			prisma.$queryRaw`
				SELECT
					p.name,
					p.id,
					COALESCE(SUM(pay.amountCents), 0) as revenue,
					COUNT(DISTINCT s.userId) as users
				FROM Plan p
				LEFT JOIN Subscription s ON p.id = s.planId
				LEFT JOIN Payment pay ON s.id = pay.subscriptionId
					AND pay.status IN ('COMPLETED', 'SUCCEEDED')
					AND pay.createdAt >= ${startDate.getTime()}
					AND pay.createdAt < ${endDate.getTime()}
				GROUP BY p.id, p.name
				ORDER BY revenue DESC
			`,
			prisma.featureUsageLog.groupBy({
				by: ['feature'],
				_sum: { count: true },
				_count: { userId: true },
				where: { createdAt: { gte: startDate, lt: endDate } },
				orderBy: { _sum: { count: 'desc' } }
			}),
			prisma.subscription.count({ where: { createdAt: { gte: startDate, lt: endDate } } }),
			prisma.subscription.count({
				where: { createdAt: { gte: previousStartDate, lt: previousEndDate } }
			}),
			prisma.featureUsageLog.groupBy({
				by: ['feature'],
				_sum: { count: true },
				_count: { userId: true },
				where: { createdAt: { gte: startDate, lt: endDate } },
				orderBy: { _sum: { count: 'desc' } }
			}),
			prisma.featureUsageLog.groupBy({
				by: ['feature'],
				_sum: { count: true },
				_count: { userId: true },
				where: { createdAt: { gte: previousStartDate, lt: previousEndDate } },
				orderBy: { _sum: { count: 'desc' } }
			}),
			prisma.$queryRaw`
				SELECT date(createdAt/1000, 'unixepoch') as date, COALESCE(SUM(amountCents), 0) as revenue
				FROM Payment
				WHERE status IN ('COMPLETED', 'SUCCEEDED')
					AND createdAt >= ${startDate.getTime()}
					AND createdAt < ${endDate.getTime()}
				GROUP BY date(createdAt/1000, 'unixepoch')
				ORDER BY date DESC
			`,
			prisma.$queryRaw`
				SELECT date(createdAt/1000, 'unixepoch') as date, COUNT(*) as subscriptions
				FROM Subscription
				WHERE createdAt >= ${startDate.getTime()}
					AND createdAt < ${endDate.getTime()}
				GROUP BY date(createdAt/1000, 'unixepoch')
				ORDER BY date DESC
			`,
			prisma.$queryRaw`SELECT COUNT(*) as count FROM VisitLog`
				.then((result: unknown) => {
					if (Array.isArray(result) && result.length > 0) {
						const first = result[0] as Record<string, unknown>;
						return Number(first['count'] ?? 0);
					}
					return 0;
				})
				.catch(() => 0),
			prisma.$queryRaw`
				SELECT COUNT(*) as count FROM VisitLog
				WHERE createdAt >= ${startDate.getTime()}
					AND createdAt < ${endDate.getTime()}
			`
				.then((result: unknown) => {
					if (Array.isArray(result) && result.length > 0) {
						const first = result[0] as Record<string, unknown>;
						return Number(first['count'] ?? 0);
					}
					return 0;
				})
				.catch(() => 0),
			prisma.$queryRaw`
				SELECT COUNT(*) as count FROM VisitLog
				WHERE createdAt >= ${previousStartDate.getTime()}
					AND createdAt < ${previousEndDate.getTime()}
			`
				.then((result: unknown) => {
					if (Array.isArray(result) && result.length > 0) {
						const first = result[0] as Record<string, unknown>;
						return Number(first['count'] ?? 0);
					}
					return 0;
				})
				.catch(() => 0),
			prisma.$queryRaw`
				SELECT COUNT(DISTINCT sessionId) as count FROM VisitLog
				WHERE createdAt >= ${startDate.getTime()}
					AND createdAt < ${endDate.getTime()}
			`
				.then((result: unknown) => {
					if (Array.isArray(result) && result.length > 0) {
						const first = result[0] as Record<string, unknown>;
						return Number(first['count'] ?? 0);
					}
					return 0;
				})
				.catch(() => 0),
			prisma.$queryRaw`
				SELECT country, COUNT(*) as visits FROM VisitLog
				WHERE createdAt >= ${startDate.getTime()}
					AND createdAt < ${endDate.getTime()}
					AND country IS NOT NULL
				GROUP BY country
				ORDER BY visits DESC
				LIMIT 10
			`
				.then((res: unknown) => (Array.isArray(res) ? (res as Array<Record<string, unknown>>) : []))
				.catch(() => []),
			prisma.$queryRaw`
				SELECT path, COUNT(*) as views FROM VisitLog
				WHERE createdAt >= ${startDate.getTime()}
					AND createdAt < ${endDate.getTime()}
				GROUP BY path
				ORDER BY views DESC
				LIMIT 10
			`
				.then((res: unknown) => (Array.isArray(res) ? (res as Array<Record<string, unknown>>) : []))
				.catch(() => [])
		]);

		void _currentPeriodFeatureUsage;
		void _previousPeriodFeatureUsage;

		const currentPeriodRevenueAmount = (currentPeriodRevenue._sum.amountCents || 0) / 100;
		const previousPeriodRevenueAmount = (previousPeriodRevenue._sum.amountCents || 0) / 100;
		const totalRevenueAmount = (totalRevenue._sum.amountCents || 0) / 100;
		const dailyRevenueAmount = (dailyRevenue._sum.amountCents || 0) / 100;
		const yesterdayRevenueAmount = (yesterdayRevenue._sum.amountCents || 0) / 100;

		const totalVisitsNum = Number(totalVisits);
		const currentPeriodVisitsNum = Number(currentPeriodVisits);
		const previousPeriodVisitsNum = Number(previousPeriodVisits);
		const uniqueVisitorsNum = Number(uniqueVisitors);

		const totalUsersNum = Number(totalUsers);
		const activeUsersNum = Number(activeUsers);
		const currentPeriodUsersNum = Number(currentPeriodUsers);
		const previousPeriodUsersNum = Number(previousPeriodUsers);
		const usersTodayNum = Number(usersToday);
		const usersThisWeekNum = Number(usersThisWeek);

		const totalSubsNum = Number(totalSubs);
		const activeSubsNum = Number(activeSubs);
		const pendingSubsNum = Number(pendingSubs);
		const canceledSubsNum = Number(canceledSubs);
		const currentPeriodSubsNum = Number(currentPeriodSubs);
		const previousPeriodSubsNum = Number(previousPeriodSubs);

		const revenueGrowthRate = previousPeriodRevenueAmount > 0
			? ((currentPeriodRevenueAmount - previousPeriodRevenueAmount) / previousPeriodRevenueAmount) * 100
			: 0;

		const userGrowthRate = previousPeriodUsersNum > 0
			? ((currentPeriodUsersNum - previousPeriodUsersNum) / previousPeriodUsersNum) * 100
			: 0;

		const conversionRate = totalUsersNum > 0 ? (activeSubsNum / totalUsersNum) * 100 : 0;
		const churnRate = totalSubsNum > 0 ? (canceledSubsNum / totalSubsNum) * 100 : 0;

		const periodDays = Math.ceil(periodLength / DAY_MS);
		const dailyAvgRevenue = periodDays > 0 ? currentPeriodRevenueAmount / periodDays : 0;
		const mrr = dailyAvgRevenue * 30;
		const arr = mrr * 12;

		const planArr = Array.isArray(planRevenue) ? (planRevenue as Array<Record<string, unknown>>) : [];
		const totalPlanRevenue = planArr.reduce(
			(sum, plan) => sum + (Number(plan['revenue'] ?? 0) || 0),
			0
		);

		const planData = planArr.map((plan) => ({
			id: String(plan['id'] ?? ''),
			name: String(plan['name'] ?? ''),
			revenue: (Number(plan['revenue'] ?? 0) || 0) / 100,
			users: Number(plan['users'] ?? 0) || 0,
			percentage: totalPlanRevenue > 0 ? ((Number(plan['revenue'] ?? 0) / totalPlanRevenue) * 100) : 0
		}));

		const featureArr = Array.isArray(featureUsage)
			? (featureUsage as Array<Record<string, unknown>>)
			: [];
		const featureData = featureArr.map((feature) => ({
			name: String(feature['feature'] ?? ''),
			usage: Number((feature['_sum'] as Record<string, unknown>)?.['count'] ?? 0) || 0,
			users: Number((feature['_count'] as Record<string, unknown>)?.['userId'] ?? 0) || 0,
			adoptionRate:
				currentPeriodUsersNum > 0
					? ((Number((feature['_count'] as Record<string, unknown>)?.['userId'] ?? 0) / currentPeriodUsersNum) * 100)
					: 0
		}));

		const subscriptionGrowthRate = previousPeriodSubsNum > 0
			? ((currentPeriodSubsNum - previousPeriodSubsNum) / previousPeriodSubsNum) * 100
			: 0;

		const revenueByDayArr = Array.isArray(revenueByDay)
			? (revenueByDay as Array<Record<string, unknown>>)
			: [];
		const processedRevenueByDay = revenueByDayArr.map((day) => ({
			date: String(day['date'] ?? ''),
			revenue: (Number(day['revenue'] ?? 0) || 0) / 100
		}));

		const subscriptionsByDayArr = Array.isArray(subscriptionsByDay)
			? (subscriptionsByDay as Array<Record<string, unknown>>)
			: [];
		const processedSubscriptionsByDay = subscriptionsByDayArr.map((day) => ({
			date: String(day['date'] ?? ''),
			subscriptions: Number(day['subscriptions'] ?? 0) || 0
		}));

		const usersByDayArr = Array.isArray(usersByDay)
			? (usersByDay as Array<Record<string, unknown>>)
			: [];
		const userGrowthData = usersByDayArr.map((day) => ({
			date: String(day['date'] ?? ''),
			users: Number(day['users'] ?? 0) || 0
		}));

		const visitGrowthRate = previousPeriodVisitsNum > 0
			? ((currentPeriodVisitsNum - previousPeriodVisitsNum) / previousPeriodVisitsNum) * 100
			: 0;

		const bounceRate = currentPeriodVisitsNum > 0
			? ((currentPeriodVisitsNum - uniqueVisitorsNum) / currentPeriodVisitsNum) * 100
			: 0;

		const visitsByCountryArr = Array.isArray(visitsByCountry)
			? (visitsByCountry as Array<Record<string, unknown>>)
			: [];
		const visitsByCountryData = visitsByCountryArr.map((country) => ({
			country: String(country['country'] ?? ''),
			visits: Number(country['visits'] ?? 0) || 0,
			percentage:
				currentPeriodVisitsNum > 0
					? ((Number(country['visits'] ?? 0) / currentPeriodVisitsNum) * 100)
					: 0
		}));

		const pageViewsArr = Array.isArray(pageViews)
			? (pageViews as Array<Record<string, unknown>>)
			: [];
		const pageViewsData = pageViewsArr.map((page) => ({
			path: String(page['path'] ?? ''),
			views: Number(page['views'] ?? 0) || 0,
			percentage:
				currentPeriodVisitsNum > 0
					? ((Number(page['views'] ?? 0) / currentPeriodVisitsNum) * 100)
					: 0
		}));

		return {
			period,
			startDate: startDate.toISOString(),
			endDate: endDate.toISOString(),
			revenue: {
				total: totalRevenueAmount,
				currentPeriod: currentPeriodRevenueAmount,
				previousPeriod: previousPeriodRevenueAmount,
				daily: dailyRevenueAmount,
				yesterday: yesterdayRevenueAmount,
				growth: revenueGrowthRate,
				mrr,
				arr,
				chartData: processedRevenueByDay
			},
			users: {
				total: totalUsersNum,
				active: activeUsersNum,
				currentPeriod: currentPeriodUsersNum,
				previousPeriod: previousPeriodUsersNum,
				growth: userGrowthRate,
				growthData: userGrowthData,
				today: usersTodayNum,
				thisWeek: usersThisWeekNum
			},
			subscriptions: {
				total: totalSubsNum,
				active: activeSubsNum,
				pending: pendingSubsNum,
				canceled: canceledSubsNum,
				currentPeriod: currentPeriodSubsNum,
				previousPeriod: previousPeriodSubsNum,
				growth: subscriptionGrowthRate,
				conversionRate,
				churnRate,
				chartData: processedSubscriptionsByDay
			},
			plans: planData,
			features: featureData,
			visits: {
				total: totalVisitsNum,
				currentPeriod: currentPeriodVisitsNum,
				previousPeriod: previousPeriodVisitsNum,
				growth: visitGrowthRate,
				uniqueVisitors: uniqueVisitorsNum,
				bounceRate,
				countries: visitsByCountryData,
				pages: pageViewsData
			},
			charts: {
				revenue: processedRevenueByDay,
				subscriptions: processedSubscriptionsByDay,
				users: userGrowthData
			}
		};
	} catch (error: unknown) {
		const err = toError(error);
		Logger.error('getAdminAnalytics failed', { error: err.message });
		throw err;
	}
}
